# Surge 兜底规则学习系统操作说明

## 1. 系统边界

本系统分成三个位置：

1. iPhone 上的 Surge 负责低成本采集和上传。
2. 私有 `Surge-Rule-Inbox` 负责入库、聚合、分类、REVIEW 和 DEFERRED。
3. 公开 Surge 仓库负责独立复验，并只更新 `main` 中经过白名单限制的规则产物。

原始 batch 不写入 Git、artifact 或 cache。公开仓库只接收已经准备公开的规则提案。

仓库内完整设计见 [安全审计版计划](plans/01-fallback-rule-learning.md)。

## 2. 启用前准备

### 2.1 公开仓库

当前公开仓库地址为 `ForestofTime/Surge`。如果使用自己的 fork，需要同步修改：

- `docs/private-inbox-template/Automation/config.json` 的 `public_repository`
- `min.conf` 中 `raw.githubusercontent.com` 的脚本和 `main` 规则地址
- `Task/FallbackRules.sgmodule` 中的脚本地址

公开仓库的 `main` 应启用分支保护，禁止 force push 和删除。发布 Workflow 只能通过普通 fast-forward push 更新规则产物白名单；任何非 fast-forward 或额外路径变化都会失败。

### 2.2 私有 Inbox

在 GitHub 新建只用于此系统的私有仓库，例如 `Surge-Rule-Inbox`，复制以下模板内容到仓库根目录：

```text
docs/private-inbox-template/.github/
docs/private-inbox-template/Automation/
docs/private-inbox-template/Inbox/
```

私有仓库建议允许 GitHub Actions bot 写入 `main` 的以下路径：

```text
Inbox/observations/
Inbox/batches/
Inbox/review/
Inbox/deferred/
```

如果分支保护禁止 bot 直接 push，intake 和 classify 会失败。此时给 GitHub Actions bot 配置最小 bypass，或者把私有状态改为单独受保护数据分支。

### 2.3 两个 Token

建议使用短有效期 Fine-grained PAT。GitHub 建议优先使用 Fine-grained PAT，并明确要求最小仓库范围和最小权限。[GitHub PAT 文档](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

| Token | 保存位置 | 仓库范围 | 权限 |
|---|---|---|---|
| 手机 Token | Surge `$persistentStore` | 仅私有 Inbox | `Actions: write` |
| `PUBLIC_DISPATCH_TOKEN` | 私有 Inbox Secrets | 仅公开 Surge 仓库 | `Actions: write` |

手机 Token 不得拥有 `Contents: write`。不要把任何 Token 写入配置文件、规则文件或 GitHub issue。

如果公开仓库不属于 Token 所有者，Fine-grained PAT 可能无法向该公开仓库写入。优先使用 GitHub App，或确认 GitHub 当前对该仓库类型的授权限制。

## 3. 配置私有 Inbox

编辑私有仓库的 `Automation/config.json`：

```json
{
  "schema_version": 1,
  "capture_enabled": true,
  "classify_enabled": false,
  "publish_enabled": false,
  "public_repository": "ForestofTime/Surge",
  "classifier_commit": "公开仓库 main 中经过审核的 40 位 commit SHA",
  "artifact_branch": "main",
  "observation_retention_days": 180,
  "review_retention_days": 365
}
```

添加私有仓库 Secret：

```text
名称：PUBLIC_DISPATCH_TOKEN
值：只授予公开仓库 Actions: write 的 Token
```

先保持 `classify_enabled=false`、`publish_enabled=false`。

## 4. PSL 快照配置

仓库当前已固定一份同时包含 ICANN 和 PRIVATE 区段的 PSL 快照，`public_suffix_list.lock.json` 中的 `ready` 为 `true`。快照来源为官方 `publicsuffix.org`，对应 `publicsuffix/list` commit `ca355e4aadee94e349e1f9c86145618cf762249d`，SHA-256 为 `bc29842a9ffd0b804db0094ba649d2365224f6b65cd415271dc90fa6005f2856`。发布前仍会校验快照哈希，哈希不匹配时立即停止。

操作步骤：

1. 从 [Public Suffix List](https://publicsuffix.org/list/) 获取包含 ICANN 和 PRIVATE 的完整文件。
2. 检查文件没有被截断，且包含 `BEGIN ICANN DOMAINS` 和 `BEGIN PRIVATE DOMAINS`。
3. 记录来源仓库的 40 位 commit SHA。
4. 计算文件 SHA-256：

   ```bash
   shasum -a 256 Automation/vendor/public_suffix_list.dat
   ```

5. 更新 `Automation/vendor/public_suffix_list.lock.json`：

   ```json
   {
     "schema_version": 1,
     "ready": true,
     "source": "https://publicsuffix.org/list/public_suffix_list.dat",
     "source_repository": "https://github.com/publicsuffix/list",
     "commit": "实际 40 位 commit SHA",
     "sha256": "实际 64 位 SHA-256",
     "sections": ["ICANN", "PRIVATE"]
   }
   ```

6. 通过 Pull Request 合并，保留人工审核记录。当前快照已经按上述流程固定。后续更新仍需重新核对版本、内容和 SHA-256。

不要只修改 `ready`，必须同时核对快照内容、commit 和 SHA-256。

## 5. 初始化 main 规则产物

发布 Workflow 只允许更新以下生成产物：

```text
Source/Auto/Direct+.list
Source/Auto/Proxy+.list
Rule/Direct+.list
Rule/Proxy+.list
manifest.json
proposals/processed.json
```

首次初始化时，先完成 PSL 配置，再用空 proposal 生成一套种子产物。下面的命令在公开仓库根目录执行：

```bash
mkdir -p .work bootstrap-rules
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const locks = JSON.parse(readFileSync('Automation/sources.lock.json', 'utf8'));
const lockDigest = createHash('sha256')
  .update(`${JSON.stringify(locks, null, 2)}\n`)
  .digest('hex');
const base = { schema_version: 1, lock_digest: lockDigest, rules: [] };
const proposal_id = createHash('sha256')
  .update(`${JSON.stringify(base)}\n`)
  .digest('hex');
writeFileSync('.work/fallback-proposal.json', `${JSON.stringify({ ...base, proposal_id })}\n`);
NODE
node Automation/generate-rules.mjs \
  --proposal-file .work/fallback-proposal.json \
  --source-root . \
  --output-root bootstrap-rules
```

将 `bootstrap-rules` 中允许的文件复制到 `main` 的对应路径，经 Pull Request 审核后合并。后续自动发布仍会在提交前复验路径白名单，不能修改 `Automation/`、`JS/`、原始观察数据、`.work/` 或 README。

## 6. 配置 Surge

### 6.1 使用当前 `min.conf`

当前 [min.conf](../min.conf) 已包含：

- 4 个脚本定义
- `main` 分支的 Direct+ 和 Proxy+ 远程 RULE-SET
- 位于正式规则末尾的 `SCRIPT,fallback-capture,Proxy`
- 最后的 `FINAL,Proxy,dns-failed`

在 Surge 中导入或合并该配置后，确认脚本开关和规则模式已启用。

### 6.2 使用其他配置

从 `min.conf` 复制 `[Script]` 中的 4 行，并加入自己的 `[Rule]`：

```text
RULE-SET,https://raw.githubusercontent.com/ForestofTime/Surge/main/Rule/Direct+.list,DIRECT
RULE-SET,https://raw.githubusercontent.com/ForestofTime/Surge/main/Rule/Proxy+.list,Proxy
SCRIPT,fallback-capture,Proxy
FINAL,Proxy,dns-failed
```

`SCRIPT,fallback-capture,Proxy` 必须位于所有正式规则之后、`FINAL` 之前。否则会把普通请求也当成兜底观察，或者改变既有规则优先级。

如果使用 `Task/FallbackRules.sgmodule`，它只声明脚本。模块安装后仍需把上述规则放到主配置的正式位置。

## 7. 首次配置手机上传

在 Surge 中执行 `fallback-setup` generic script，传入以下格式的 `$argument`：

```text
owner=你的 GitHub 用户名或组织&repo=Surge-Rule-Inbox&token=github_pat_你的 Token
```

第一次建议加入 `upload=false`：

```text
owner=你的 GitHub 用户名或组织&repo=Surge-Rule-Inbox&token=github_pat_你的 Token&upload=false
```

脚本会固定以下字段，传入其他地址或 Workflow 会被拒绝：

```text
workflow=intake-fallback.yml
ref=main
policy=Proxy
endpoint=https://api.github.com
```

脚本使用 Surge 持久存储的 `write(data, key)` 接口，Token 不会打印到日志。[Surge Scripting 文档](https://manual.nssurge.com/scripting/common.html)

## 8. 7 天 dry-run

### 8.1 只采集

保持：

```json
"capture_enabled": true,
"classify_enabled": false,
"publish_enabled": false
```

私有配置中的 `capture_enabled` 只作为状态记录。手机端实际是否采集由 Surge 持久配置控制，必须通过 setup script 的 `capture=true|false` 修改。

手机端可保持 `upload=false`，先确认采集逻辑和本地队列。需要检查上传链路时，再用 setup 脚本切换：

```text
capture=true&upload=true
```

### 8.2 私有分类 dry-run

在私有 Inbox 中将 `classify_enabled` 改为 `true`，保持 `publish_enabled=false`。

此时分类 Workflow 会：

- 合并观察天数
- 生成私有 `REVIEW` 和 `DEFERRED`
- 生成 `.work/proposal.json`
- 提交私有分类状态
- 跳过公开 dispatch

至少观察 7 天，重点看：

1. `REVIEW` 是否包含内部域名、家庭服务、办公系统或高熵域名。
2. `DEFERRED` 是否只来自上游失败、锁不一致或 PSL 不可用。
3. PROXY 提案是否确实来自已锁定来源和足够观察天数。
4. 是否存在重复 proposal、跨策略冲突或错误父级 suffix。

## 9. 开启公开自动发布

确认 dry-run 结果后：

1. 公开仓库先合并人工 source、来源锁和 PSL PR。
2. 确认 `main` 中的规则产物与 `manifest.json` 一致，且工作区没有额外变化。
3. 私有配置设置：

   ```json
   "classify_enabled": true,
   "publish_enabled": true
   ```

4. 手机配置设置 `upload=true`。

手机只等待私有 intake Workflow 成功。分类和公开发布由后续 Workflow 异步执行。GitHub Workflow Dispatch 当前文档返回 `workflow_run_id`，上传脚本会保存并轮询该 run。[Workflow Dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event)

## 10. 正常运行链路

```text
请求命中 FINAL 前的 SCRIPT
    ↓
本地 32 个 shard，每目标每天最多写一次
    ↓
每天 02:00 旋转 immutable batch
    ↓
私有 intake Workflow 校验并持久化
    ↓
私有 classify Workflow 聚合和分类
    ↓
高置信度 PROXY proposal dispatch
    ↓
公开 publish Workflow 重新校验
    ↓
main 分支更新 RULE-SET 产物
```

上传批次只有在私有 intake run 为 `completed/success` 后才会从手机删除。401、权限错误、404、422 会进入 blocked 状态；限流、429、5xx、网络错误会退避重试。

## 11. 日常检查

### macOS Surge CLI

```bash
SURGE=/Applications/Surge.app/Contents/Applications/surge-cli

"$SURGE" --check min.conf
"$SURGE" --raw environment
"$SURGE" --raw dump policy
"$SURGE" --raw dump profile effective
"$SURGE" script evaluate JS/fallback-capture.js rule 1
"$SURGE" script evaluate JS/fallback-upload.js cron 30
"$SURGE" script evaluate JS/fallback-setup.js generic 10
```

手机上可检查 Surge 的脚本执行记录、远程 RULE-SET 更新时间、以及规则命中情况。不要在日志中粘贴 Token、完整 payload 或 REVIEW 域名。

### GitHub Actions

依次检查：

1. 私有 `intake fallback observations` 是否成功。
2. 私有 `classify fallback observations` 是否只更新允许路径。
3. 公开 `publish fallback rules` 是否通过 PSL、source lock 和产物 diff 校验。
4. `main` 是否只产生预期的 `Rule/Direct+.list`、`Rule/Proxy+.list` 或清单变化。

## 12. 手工重试和故障处理

### 手机无法上传

1. 先不要删除 Surge 持久存储中的 `frq.batch.*`。
2. 检查私有 intake Workflow 是否被禁用。
3. 检查 Token 是否过期、是否拥有私有 Inbox 的 `Actions: write`。
4. 检查 `frq.config` 中的 owner、repo、workflow 和 ref。
5. 恢复网络后执行一次 `fallback-upload-network`。

### 401

撤销旧 Token，创建新 Token，在 Surge 重新运行 setup。不要修改 Workflow 权限来绕过 401。

### 403

先看是否有 `Retry-After` 或速率限制耗尽。限流会退避，权限或 SSO 错误需要修正 Token。不要把所有 403 都当作 Token 失效。

### DEFERRED 持续增加

检查 source lock、上游 HTTPS、内容 SHA-256、响应大小和 PSL lock。上游异常期间保持发布关闭，不要手工把 DEFERRED 直接改成 proposal。

### publish Workflow 失败

优先检查：

1. PSL `ready` 是否为 `true`。
2. PSL 快照 SHA-256 是否匹配。
3. proposal 的 `lock_digest` 是否与公开 `sources.lock.json` 匹配。
4. 产物 diff 是否包含未允许文件或 symlink。
5. 是否出现跨策略 overlap。

## 13. Kill switch、撤销和回滚

### 停止手机采集和上传

运行 setup generic script：

```text
capture=false&upload=false
```

这不会删除已经排队的 batch。

### 停止私有分类

把私有 `Automation/config.json` 的 `classify_enabled` 改为 `false`，提交后等待正在运行的 Workflow 结束。

### 停止公开发布

把私有 `publish_enabled` 改为 `false`，同时把公开仓库 `Automation/control-plane.json` 的 `kill_switches.publish_enabled` 改为 `false` 并通过 PR 合并。

### 回滚规则

在 `main` revert 上一条经过验证的 `chore(rules)` 产物提交。不要连带回退分类器代码。

### Token 泄露

1. 立即在 GitHub 撤销泄露 Token。
2. 在 Surge 中重新运行 setup 写入新 Token。
3. 检查私有 Inbox 的 Actions 历史，确认没有异常 dispatch、取消或重跑。
4. 如果公开 proposal 已提交，按正常 `main` 产物提交回滚流程处理。

## 14. 不应自动化的内容

- DIRECT 观察结果
- 公网 IP
- REJECT 观察式父域
- `DOMAIN-KEYWORD` 生成
- PSL 公共后缀和多租户后缀
- GitHub、规则源、Surge 规则托管域名
- 含账户 ID、UUID、租户 ID 或高熵标签的域名

这些目标进入 REVIEW、DEFERRED 或永久 denylist，避免错误放行、隐私泄露和规则范围扩大。

## 15. 完成验收

启用无人值守发布前，确认以下项目全部完成：

- [ ] 手机 Token 只有私有 Inbox 的 `Actions: write`
- [ ] 公开 dispatch Token 只有公开仓库的 `Actions: write`
- [ ] 原始 payload 没有进入 Git、日志、artifact 或 cache
- [ ] 私有 intake、classify 和公开 publish 均通过安全测试
- [x] PSL 快照已人工审核，`ready=true` 且 SHA-256 匹配
- [ ] 自动发布对 `main` 的修改只包含允许产物
- [ ] 已完成至少 7 天 dry-run
- [ ] 已验证锁屏、断网、Surge 重启和 Token 轮换
- [ ] 已验证一次成功发布和一次 `main` 产物提交回滚

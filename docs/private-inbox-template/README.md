# 私有 Surge Rule Inbox 模板

这是可复制到独立私有仓库的模板。当前仓库只提供模板，**不会代替用户创建私有仓库、PAT、GitHub App 或 Secrets**。

## 初始化

1. 新建一个只用于 Surge 兜底观察的私有仓库，例如 `Surge-Rule-Inbox`。
2. 复制本目录中的 `.github/` 和 `Automation/` 到该私有仓库根目录。
3. 将 `inbox-fallback.yml` 中的 `ref: main` 换成实际受保护分支。
4. 创建 Fine-grained PAT，仓库范围只选该私有仓库，权限只授予 `Actions: write`，设置短有效期。该 PAT 只放在 Surge `$persistentStore`，不得写入仓库。
5. 在私有仓库 Secrets 中设置 `PUBLIC_DISPATCH_TOKEN`。该 Fine-grained PAT 只授予公开 Surge 仓库 `Actions: write`，用于最后一步 dispatch，不能写入公开内容。
6. 将公开仓库的固定分类器 commit、仓库名和产物分支 `main` 写入 `Automation/config.json`。
7. 在 GitHub 仓库设置中关闭与本用途无关的 `workflow_dispatch`，保护 `main`，禁止 force push 和删除分支。
8. 先保持 `classify_enabled=false` 和 `publish_enabled=false`，完成至少 7 天 dry-run 后再单独启用。两项开关必须同时为 true 才会 dispatch。

## 数据边界

- 原始 dispatch payload 不写入 Git、日志、artifact 或 cache。
- `Inbox/observations/` 只保存规范化目标、首次日期、最近日期和服务端观察天数。
- `Inbox/batches/` 只保存 batch ID、传输哈希、接收日期和处理状态。
- REVIEW、DEFERRED、观察频率和设备信息只留在该私有仓库。
- 已发布到公开规则仓库的域名或 IP 无法再由 inbox 隐藏。

`capture_enabled` 是私有仓库的状态记录。手机端的实际采集开关由 Surge setup 脚本的 `capture=true|false` 控制。

## 撤销和回滚

- PAT 泄露时立即在 GitHub 撤销并删除 Surge 持久存储中的 token。
- 将 `Automation/config.json` 的 `capture_enabled`、`classify_enabled` 或 `publish_enabled` 设为 `false`。
- 公开规则回滚应 revert `main` 中对应的 `chore(rules)` 产物提交，不回退分类器代码。
- 私有数据删除需要同时清理 observations、batches、Actions 日志和仓库历史。

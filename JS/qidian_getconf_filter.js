// Function to handle daily recommend
if (url === 'https://magev6.if.qidian.com/argus/api/v2/dailyrecommend/getdailyrecommend') {
    return {
        Data: {
            Items: [],
            BgInfo: undefined,
            AiRecommendUrl: undefined,
            BookshelfShowType: 0
        },
        Message: '',
        Result: 0
    };
}

// Function to handle checkin simple info
if (url === 'https://magev6.if.qidian.com/argus/api/v2/checkin/simpleinfo') {
    return {
        Data: {},
        Message: '',
        Result: 0
    };
}

// Keep other logic unchanged
// [existing code continues here]
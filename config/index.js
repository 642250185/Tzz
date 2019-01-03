const path = require('path');

const config = {
    PPU: 'TT=523e8ea8fdb9f3909f38e758621f3781c3f8db71&UID=46028783232276&SF=ZHUANZHUAN&SCT=1546501089213&V=1&ET=1549089489213',

    domain: 'https://app.zhuanzhuan.com/',
    openRoute: 'zzopen/ypdeal/',
    historyPath: 'getHistoryList',
    detailPath: 'buyerActivityDetail',
    recordRoute: 'zz/transfer/',
    recordPath: 'getAllPriceFront',

    dataPath: path.join(__dirname, '..', 'data/item.json'),
    downloadPath: path.join(__dirname, '..','download'),
    // historyUrl: 'http://bijia.huishoubao.com:4003/history',
    historyUrl: '127.0.0.1:4003/history',
    //默认取前1天的数据，不包括当天
    defaultDay: 5,
	//结束时间, 默认为空
	endDate: '2018-11-05',
    /**
     * 返回或设置当前环镜
     */
    env: function () {
        global.$config = this;

        return global.$config;
    }
};


module.exports = config.env();
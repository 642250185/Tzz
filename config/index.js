const path = require('path');

const config = {
    PPU: 'TT=89ad7fa866476db8c3be76b93c5c571a307aa0ea&UID=46028783232276&SF=ZHUANZHUAN&SCT=1536823103574&V=1&ET=1539411503574',
    downloadPath: path.join(__dirname, '..','download'),
    historyUrl: 'http://bijia.huishoubao.com:4003/history',
    //默认取前7天的数据，不包括当天
    defaultDay: 7,
    /**
     * 返回或设置当前环镜
     */
    env: function () {
        global.$config = this;

        return global.$config;
    }
};


module.exports = config.env();
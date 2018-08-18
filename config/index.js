const path = require('path');

const config = {
    PPU: 'TT=47c6fb10300b86636675d57b3106ccedadf5ea1c&UID=58317480120192256&SF=ZHUANZHUAN&SCT=1531974203093&V=1&ET=1534562603093',
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

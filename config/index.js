const path = require('path');

const config = {
    PPU: 'TT=89ad7fa866476db8c3be76b93c5c571a307aa0ea&UID=46028783232276&SF=ZHUANZHUAN&SCT=1536823103574&V=1&ET=1539411503574',
    dataPath: path.join(__dirname, '..', 'data/item.json'),
    downloadPath: path.join(__dirname, '..','download'),
    historyUrl: 'localhost:4003/history',
    //默认取前1天的数据，不包括当天
    defaultDay: 30,
	//结束时间, 默认为空
	endDate: '2018-05-12',
    /**
     * 返回或设置当前环镜
     */
    env: function () {
        global.$config = this;

        return global.$config;
    }
};


module.exports = config.env();
const request = require('superagent');
const {PPU, historyUrl, downloadPath, defaultDay, endDate} = require('./config');
const {formatDate} = require('./util/dateUtil');
const xlsx = require('node-xlsx').default;
const spuMappings = xlsx.parse('./mapping.xls');
const spuMap = new Map();
const fs = require('fs');
let cookie;

const getSpuMapping = () => {
    Object.keys(spuMappings).forEach(function(key){
        spuMappings[key].data.forEach(function(item){
            spuMap.set(item[0], item[1]);
        });
    });
};

const formatCookie = () => {
    cookie = `PPU="${PPU}"`;
    console.info('cookie: ', cookie);
};

const getHistory = async () => {
	const result = await request.get(historyUrl)
		.query({day: defaultDay, endDate});
	return JSON.parse(result.text);
};

const getSalesReport = async (id) => {
    try {
        const result = await request.get(`https://zhuan.58.com/zzopen/ypdeal/buyerActivityDetail?activityId=${id}`)
            .set('Cookie', cookie);
        const {respData, respCode} = JSON.parse(result.text);
        if(respCode === -2) {
            throw new Error('登录已过期，请联系王瑞瑞获取新的cookie');
        }
        return respData;
    }catch (e) {
        console.log(e);
    }
};


//单个机型竞拍历史数据
const getAuctionHistory = async (id) => {
    try {
        if(!id) {
            return [];
        }
        const result = await request.get(`https://zhuan.58.com/zz/transfer/getAllPriceFront?infoId=${id}&pageSize=150`)
            .set('Cookie', cookie);
        const {priceList} = JSON.parse(result.text).respData;
        const list = [];
        for(let i in priceList) {
            const item = priceList[i];
            const row = [];
            row.push(id);
            row.push(item.nickname);
            row.push(item.portrait);
            row.push(item.price);
            row.push(formatDate(new Date(Number(item.timestamp))));
            list.push(row);
        }
        return list;
    } catch (e) {
        throw new Error(e);
    }
};

function isJSON (str) {
    if (typeof str == 'string') {
        try {
            var obj = JSON.parse(str);
            if(typeof obj == 'object' && obj ){
                return true;
            } else {
                return false;
            }
        } catch(e) {
            return false;
        }
    }
};

//机型检测数据
const getOptions = async (id, qcId) => {
    try {
        const result = await request.get(`https://youpin.58.com/v/helpsale/report?id=${qcId}`)
            .set('Cookie', cookie);
        const {data} = JSON.parse(result.text);
        if(data === null){  // API接口返回数据存在为空的场景
            return [];
        }
        const {basicCheck, basicInfo, displayCheck, basicCheckList, functionCheck} = data;
        const list = [];
        list.push(id);
        // ① 基础检查
        if(basicCheck) {
            for(let i in basicCheck) {
                list.push(basicCheck[i].value);
            }
        }

        // ② 功能检查
        if(functionCheck) {
            functionCheck.list.forEach(item => {
                const isJson = isJSON(item);
                if(isJson){
                    let obj = JSON.parse(item);
                    list.push(obj.desc);
                } else {
                    list.push(item);
                }
            });
        }

        // ③ 基础信息（SKU）
        if(basicInfo) {
            const skus = basicInfo.split('|');
            for(let sku of skus) {
                list.push(sku.trim());
            }
        }

        // ④ 展示检查
        if(displayCheck) {
            displayCheck.list.forEach(item => {
                const isJson = isJSON(item);
                if(isJson){
                    let obj = JSON.parse(item);
                    list.push(obj.desc);
                } else {
                    list.push(item);
                }
            });
        }

        // ⑤ 基础检查集合
        if(basicCheckList && basicCheckList.length > 0) {
            for(let item of basicCheckList){
                const {key, itemList} = item;
                let itemChild = {};
                for(let child of itemList){
                    itemChild[child.key] = child.value;
                }
                list.push(`${key}:${JSON.stringify(itemChild)}`);
            }
        }
        return list;
    }catch (e) {
        throw new Error(e);
    }
};

const exportExcel = async () => {
    formatCookie();
    getSpuMapping();
    const items = await getHistory();
    console.log(`前${defaultDay}天转转竞拍商品总数量: ${items.length}`);

    //商品竞拍信息
    const spuAcutionList = [['竞拍编号', '机型ID', '回收宝机型ID', '机型名称', '起拍价', '成交价', '出价次数', '中标人', '中标人头像链接', '订单状态']];
    //商品详情
    const spuinfoList = [];
    let acutionList = [['竞拍编号', '出价人', '出价人头像', '出价', '出价时间']];
    let num = 0;
    for(let item of items) {
        console.log('>>num: %d, item: %j',++num, item);
        const row = [];
        const {activityId, zzItemId} = item;
        const saleReport = await getSalesReport(activityId);
        if(saleReport === null){    // API接口返回数据存在为空的场景
            continue;
        }
        const {xinghaoId, qcId, productName, startPrice, dealPrice} = saleReport;
        row.push(activityId.toString());
        row.push(xinghaoId);
        row.push(spuMap.get(xinghaoId.toString()) || '');
        row.push(productName);
        row.push(startPrice);
        row.push(dealPrice);
        const auctionHistories = await getAuctionHistory(zzItemId);
        row.push(auctionHistories.length);
        auctionHistories.forEach(auc => {
            acutionList.push(auc);
        });
        if(auctionHistories.length > 0) {
            const bidder = auctionHistories[0];
            row.push(bidder[1]);
            row.push(bidder[2]);
            row.push('成交');
        }else {
            row.push('');
            row.push('');
            row.push('流拍');
        }
        spuAcutionList.push(row);
        // ### 商品详情API接口存在问题。
        const spuinfo = await getOptions(activityId, qcId);
        console.info('size: %d',spuinfo.length);
        spuinfoList.push(spuinfo);
    }
    const currentTime = formatDate(new Date(), 'YYYY-MM-DD-HH');
    const filename = `${downloadPath}/${currentTime}.xlsx`;
    fs.writeFileSync(filename, xlsx.build([
        {name: '商品竞拍信息', data: spuAcutionList},
        {name: '竞拍流水', data: acutionList},
        {name: '商品详情', data: spuinfoList}
    ]));
    console.log(`爬取结束, 成功导出文件: ${filename}`);
};


exports.exportExcel = exportExcel;
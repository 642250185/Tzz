const _ = require('lodash');
const _path = require('path');
const fs = require('fs-extra');
const request = require('superagent');
const xlsx = require('node-xlsx').default;
const {formatDate} = require('./util/dateUtil');
const spuMappings = xlsx.parse('./mapping.xls');
const {PPU, historyUrl, downloadPath, dataPath, statisticsPath, defaultDay, endDate} = require('./config');

const spuMap = new Map();
let cookie, temporary;
let failure = 0;
const COMMOM = {brand: "品牌", model: "型号"};

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
    } catch (e) {
        console.error(e);
    }
};

//单个机型竞拍历史数据
const getAuctionHistory = async (id) => {
    try {
        if(!id) {
            return [];
        }
        const result = await request.get(`https://zhuan.58.com/zz/transfer/getAllPriceFront?infoId=${id}&pageSize=150`)
            .set('Cookie', cookie).timeout({
                response: 5000,
                deadline: 8000
            });
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

const saveItem = async (item) => {
    await fs.ensureDir(_path.join(dataPath, '..'));
    fs.writeFileSync(dataPath, JSON.stringify(item, null, 4));
};

const compareItem = async (items, item) => {
    let start = false, result = [];
    for(let obj of items){
        if(item.zzItemId === obj.zzItemId){
            start = true;
        }
        if(start){
            result.push(obj);
        }
    }
    return result;
};

const getItem = async () => {
    return JSON.parse(fs.readFileSync(dataPath));
};

const getBasic = async (respData) => {
    let brand, model;
    const basicCheck = respData.basicCheck;
    if(!_.isEmpty(basicCheck)){
        for(let basic of basicCheck){
            if(basic.key == COMMOM.brand){
                brand = basic.value;
            }
            if(basic.key == COMMOM.model){
                model = basic.value;
            }
        }
        if(!brand && !model){
            brand = respData.brand;
            model = respData.model;
        }
    } else {
        brand = respData.brand;
        model = respData.model;
    }
    return {brand, model};
};

//机型检测数据
const getOptions = async (id, qcId) => {
    // 旧API接口
    /*try {
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

        console.info('list: ', list);

        return list;
    } catch (e) {
        throw new Error(e);
    }*/

    // 新API接口
    try {
        const final = [];
        const result = await request.get(`https://app.zhuanzhuan.com/zzopen/ypdeal/report?id=${qcId}`)
            .set('Cookie', cookie);
        if(_.isEmpty(result)){
            console.warn(`${++failure} API接口没有返回数据。`);
            return final;
        }
        const {respCode, respData, errorMsg} = JSON.parse(result.text);
        console.info(`respCode: ${respCode}, errorMsg: ${errorMsg}`);

        if(respCode === 0){
            if(_.isEmpty(respData)){
                console.warn(`${++failure} 警告: API接口无返回数据!`);
                return final;
            }
            // SKU
            let {brand, model} = await getBasic(respData);
            console.info('brand: %j, model: %j', brand, model);
            final.push(`${brand} ${model}`);
            final.push(respData.basicInfo);
            // 机况
            const basicCheckList = respData.basicCheckList;
            if(!_.isEmpty(basicCheckList)){
                for(let basicChec of basicCheckList){
                    const {key, itemList} = basicChec;
                    let itemChild = {};
                    for(let child of itemList){
                        itemChild[child.key] = child.value;
                    }
                    final.push(`${key}:${JSON.stringify(itemChild)}`);
                }
            }
            // 设备功能
            const funList = [];
            const functionCheck = respData.functionCheck;
            if(!_.isEmpty(functionCheck)){
                functionCheck.list.forEach(item => {
                    const isJson = isJSON(item);
                    if(isJson){
                        let obj = JSON.parse(item);
                        funList.push(obj.desc)
                    } else {
                        funList.push(item.desc)
                    }
                });
                final.push(funList.join(" # "));
            } else {
                final.push("");
            }
            // 屏幕显示
            const displayList = [];
            const displayCheck = respData.displayCheck;
            if(!_.isEmpty(displayCheck)){
                displayCheck.list.forEach(item => {
                    const isJson = isJSON(item);
                    if(isJson){
                        let obj = JSON.parse(item);
                        displayList.push(obj.desc);
                    } else {
                        displayList.push(item.desc);
                    }
                });
                final.push(displayList.join(" # "));
            } else {
                final.push("");
            }
            // 工程师有话说
            final.push(respData.zjStr);
        }
        console.info('final: %j', final);
        return final;
    } catch (e) {
        throw new Error(e);
    }
};

//导出Excel
const exportExcel = async () => {
    //商品详情
    let spuinfoList = [];
    //竞拍流水
    let acutionList = [['竞拍编号', '出价人', '出价人头像', '出价', '出价时间']];
    //商品竞拍信息
    let spuAcutionList = [['竞拍编号', '机型ID', '回收宝机型ID', '机型名称', '起拍价', '成交价', '出价次数', '中标人', '中标人头像链接', '订单状态']];
    const currentTime = formatDate(new Date(), 'YYYY-MM-DD-HH-mm-ss');
    try {
        let num = 0;
        formatCookie();
        getSpuMapping();
        let items = await getHistory();
        console.log(`前${defaultDay}天转转竞拍商品总数量: ${items.length}`);
        // 获取上次中断的items
        const interruptItem = await getItem();
        if(!_.isEmpty(interruptItem)){
            items = await compareItem(items, interruptItem);
        }
        for(let item of items) {
            temporary = item;
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
            if(!_.isEmpty(xinghaoId)){
                row.push(spuMap.get(xinghaoId.toString()) || '');
            } else {
                row.push('');
            }
            row.push(productName);
            row.push(startPrice);
            row.push(dealPrice);
            const auctionHistories = await getAuctionHistory(zzItemId, num);
            row.push(auctionHistories.length);
            auctionHistories.forEach(auc => {
                acutionList.push(auc);
            });
            if(auctionHistories.length > 0) {
                const bidder = auctionHistories[0];
                row.push(bidder[1]);
                row.push(bidder[2]);
                row.push('成交');
            } else {
                row.push('');
                row.push('');
                row.push('流拍');
            }
            spuAcutionList.push(row);
            // ### 商品详情API接口存在问题。
            const spuinfo =  await getOptions(activityId, qcId);
            console.info('size: %d', spuinfo.length);
            spuinfoList.push(spuinfo);
        }
        const filename = `${downloadPath}/${currentTime}.xlsx`;
        fs.writeFileSync(filename, xlsx.build([
            {name: '商品竞拍信息', data: spuAcutionList},
            {name: '竞拍流水', data: acutionList},
            {name: '商品详情', data: spuinfoList}
        ]));
        console.log(`爬取结束, 成功导出文件: ${filename}`);
        // 清空中断的数据
        await saveItem({});
    } catch (e) {
        console.error('exportExcelError: ', e);
        await saveItem(temporary || {});
        const filename = `${downloadPath}/部分#${currentTime}.xlsx`;
        fs.writeFileSync(filename, xlsx.build([
            {name: '商品竞拍信息', data: spuAcutionList},
            {name: '竞拍流水', data: acutionList},
            {name: '商品详情', data: spuinfoList}
        ]));
        console.warn(`爬取部分结束, 成功导出文件: ${filename}`);
        return e;
    }
};


exports.exportExcel = exportExcel;
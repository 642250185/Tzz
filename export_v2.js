const _ = require('lodash');
const _path = require('path');
const fs = require('fs-extra');
const config = require('./config');
const request = require('superagent');
const xlsx = require('node-xlsx').default;
const sleep = require('js-sleep/js-sleep');
const {formatDate} = require('./util/dateUtil');

const {PPU, domain, openRoute, historyPath, detailPath, recordRoute, recordPath, downloadPath} = config;

let cookie, failure = 0, number = 0, key = 0;
const formatCookie = () => {
    cookie = `PPU="${PPU}"`;
    console.info('cookie: ', cookie);
};

const getQcId = async(activityId) => {
    try {
        const path = `${domain}${openRoute}${detailPath}?activityId=${activityId}`;
        let result = await request.get(path).set('Cookie', cookie);
        result = JSON.parse(result.text);
        const {respCode, respData, errorMsg} = result;
        if(respCode === 0){
            return respData.qcId;
        } else {
            console.warn(` getQcId >>>> respCode: ${respCode},  errorMsg: ${errorMsg}`);
            return "";
        }
    } catch (e) {
        console.error(e);
        return "";
    }
};

/**
 * 获取竞价最高的人
 * @param zzItemId
 * @returns {Promise<*>}
 */
const getBiddingMaxPeople = async(zzItemId) => {
    try {
        const pageSize = 10000;
        const path = `${domain}${recordRoute}${recordPath}?infoId=${zzItemId}&pageSize=${pageSize}`;
        let result = await request.get(path).set('Cookie', cookie);
        result = JSON.parse(result.text);
        const {respCode, respData} = result;
        const {totalCount, priceList} = respData;
        if(respCode === "0"){
            if(priceList.length !== 0){
                return priceList[0];
            }
        } else {
            return {};
        }
    } catch (e) {
        console.error(e);
        return {};
    }
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

function isJSON (str) {
    if (typeof str == 'string') {
        try {
            let obj = JSON.parse(str);
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

/**
 * 获取机型数据报告
 * @param qcId
 * @returns {Promise<*>}
 */
const getReport = async(activityId, qcId) => {
    try {
        const final = [];
        const path = `${domain}${openRoute}report?id=${qcId}`;
        let result = await request.get(path).set('Cookie', cookie);
        result = JSON.parse(result.text);
        if(_.isEmpty(result)){
            console.warn(`${++failure} API接口没有返回数据。`);
            return final;
        }
        const {respCode, respData, errorMsg} = result;
        if(respCode === 0){
            if(_.isEmpty(respData)){
                console.warn(`${++failure} 警告: API接口无返回数据!`);
                return final;
            }
            // TODO 竞拍编号
            final.push(activityId);
            // SKU
            let {brand, model} = await getBasic(respData);
            // console.info('brand: %j, model: %j', brand, model);
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
            // TODO 设备功能
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
            // TODO 屏幕显示
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
            // TODO 工程师有话说
            final.push(respData.zjStr);
        } else {
            console.info(`商品详情: respCode: ${respCode},  errorMsg: ${errorMsg}`);
        }
        console.info(`index: [${++key}]   activityId: ${activityId}   final: ${final.length}   ${final}`);
        return final;
    } catch (e) {
        console.error(e);
        return e;
    }
};

/**
 * 竞拍流水
 * @param activityId    竞拍ID
 * @param zzItemId
 * @returns {Promise<*>}
 */
const getRecords = async(activityId, zzItemId) => {
    try {
        const final = [];
        const pageSize = 10000;
        const path = `${domain}${recordRoute}${recordPath}?infoId=${zzItemId}&pageSize=${pageSize}`;
        let result = await request.get(path).set('Cookie', cookie);
        result = JSON.parse(result.text);
        const {respCode, respData} = result;
        const {totalCount, priceList} = respData;
        if(respCode === "0"){
            if(priceList.length !== 0){
                for(let item of priceList){
                    final.push({
                        activityId,
                        nickname    :   item.nickname,
                        portrait    :   item.portrait,
                        price       :   item.price,
                        timestamp   :   formatDate(new Date(Number(item.timestamp))),
                    });
                }
                return final;
            }
        } else {
            return [];
        }
    } catch (e) {
        console.error(e);
        return [];
    }
};

/**
 * 获取历史记录
 * @param hList 结果
 * @param pageNum   第几页
 * @returns {Promise<*>}
 */
const getHistory = async(hList, pageNum) => {
    try {
        formatCookie();
        const cateId = 101;
        const pageSize = 300;
        const auctionType = 0;
        if(_.isEmpty(hList)){
            hList = [];
            pageNum = 364
        }
        const path = `${domain}${openRoute}${historyPath}?cateId=${cateId}&pageNum=${pageNum}&auctionType=${auctionType}&pageSize=${pageSize}`;
        let result = await request.get(path).set('Cookie', cookie);
        result = JSON.parse(result.text);
        const {respCode, respData, errorMsg} = result;
        if(respCode === 0){
            const respList = [];
            console.info(`第 [${pageNum}] 页, 每页 ${pageSize} 条, 结果: ${respData.length}`);
            for(const item of respData){
                const qcId = await getQcId(item.activityId);
                const record = await getBiddingMaxPeople(item.zzItemId);
                console.info(`number: [${++number}]   activityId: ${item.activityId}  zzItemId: ${item.zzItemId}   productName: ${item.productName}   startPrice: ${item.startPrice}   dealPrice: ${item.dealPrice}   offerTimes: ${item.offerTimes}  qcId: ${qcId}  nickname: ${record.nickname}  portrait: ${record.portrait}`);
                respList.push({
                    activityId  : item.activityId,  // 竞拍ID
                    zzItemId    : item.zzItemId,    //
                    qcId        : qcId,             //
                    productName : item.productName, // 产品名称
                    startPrice  : item.startPrice,  // 起拍价
                    dealPrice   : item.dealPrice,   // 成交价
                    offerTimes  : item.offerTimes,  // 出价次数
                    joinedCount : item.joinedCount, // 参与人数
                    nickname    : record.nickname,  // 中标人
                    portrait    : record.portrait   // 中标人头像
                });
            }

            if(pageNum === 300){
                return hList;
            } else {
                pageNum--;
                hList = hList.concat(respList);
                return await getHistory(hList, pageNum);
            }

            // TODO 生产使用
            // if(respData.length != 0){
            //     pageNum++;
            //     hList = hList.concat(respList);
            //     return await getHistory(hList, pageNum);
            // } else {
            //     return hList;
            // }

            // TODO 测试使用
            // return respList;

        } else {
            return [];
        }
    } catch (e) {
        console.error(e);
        return e;
    }
};


const exportExcel = async() => {
    try {
        let recordsList = [];
        const historyList = await getHistory();
        console.info(`历史竞拍成交记录: ${historyList.length}`);
        const currentTime = formatDate(new Date(), 'YYYY-MM-DD-HH-mm-ss');
        const historyTable = [['竞拍编号', '转转商品编号', 'qcId', '商品名称', '起拍价', '成交价', '出价次数', '参与人数', '中标人', '中标人头像']];
        const recordsTable = [['竞拍编号', '出价人', '出价人头像', '出价', '出价时间']];
        const reportTable = [];

        for(const item of historyList){
            const {activityId, zzItemId, qcId} = item;
            const _recordsList = await getRecords(activityId, zzItemId);    // 竞拍流水
            const _reportList = await getReport(activityId, qcId);          // 机型报告
            recordsList = recordsList.concat(_recordsList);                 // 聚合竞拍流水
            const row = [];
            row.push(item.activityId);
            row.push(item.zzItemId);
            row.push(item.qcId);
            row.push(item.productName);
            row.push(item.startPrice);
            row.push(item.dealPrice);
            row.push(item.offerTimes);
            row.push(item.joinedCount);
            row.push(item.nickname);
            row.push(item.portrait);
            historyTable.push(row);
            reportTable.push(_reportList);
        }
        console.info(`历史竞拍成交记录-List: ${historyList.length},  竞拍流水总量: ${recordsList.length}`);
        for(const item of recordsList){
            const row = [];
            row.push(item.activityId);
            row.push(item.nickname);
            row.push(item.portrait);
            row.push(item.price);
            row.push(item.timestamp);
            recordsTable.push(row);
        }
        console.info(`历史竞拍成交记录-Table: ${historyTable.length},  竞拍流水总量: ${recordsTable.length},  机型报告总量: ${reportTable.length}`);
        const filename = `${downloadPath}/${currentTime}.xlsx`;
        fs.writeFileSync(filename, xlsx.build([
            {name: '商品竞拍信息', data: historyTable},
            {name: '竞拍流水', data: recordsTable},
            {name: '商品详情', data: reportTable}
        ]));
        console.log(`爬取结束, 成功导出文件: ${filename}`);
        return;
    } catch (e) {
        console.error(e);
        return e;
    }
};


exportExcel();
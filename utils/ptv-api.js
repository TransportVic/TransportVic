const crypto = require('crypto');
const request = require('request');
const {ptvKey, ptvDevID} = require('../config.json');

function getURL(request) {
    request += (request.includes('?') ? '&' : '?') + 'devid=' + ptvDevID;
    let signature = crypto.createHmac('SHA1', ptvKey).update(request).digest('hex').toString('hex');
    return 'https://timetableapi.ptv.vic.gov.au' + request + '&signature=' + signature;
}

function makeRequest(url, callback) {
    let fullURL = getURL(url);
    request(fullURL, (err, resp, body) => {
        callback(err, JSON.parse(body));
    });
}

module.exports = { makeRequest }

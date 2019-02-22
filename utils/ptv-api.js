const crypto = require('crypto');
const {ptvKey, ptvDevID} = require('../config.json');

function getURL(request) {
    request += request.includes('?') ? '&' : '?' + 'devid=' + ptvDevID;
    let signature = crypto.createHmac('SHA1', ptvKey).update(request).digest('hex').toString('hex');
    return 'https://timetableapi.ptv.vic.gov.au' + request + '&signature=' + signature;
}

module.exports = { getURL }

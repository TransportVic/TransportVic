const ptvAPI = require('./ptv-api');
const EventEmitter = require('events');

let departureCache = {};
let departureLocks = {};

function getDepartures(routeID, routeType, stopID, directionID, time, callback) {
    let key = `/v3/departures/route_type/${routeType}/stop/${stopID}/route/${routeID}?direction_id=${directionID}&date_utc=${time.toISOString()}`;

    if (departureCache[key]) {
        callback(departureCache[key]);
        return;
    }

    if (departureLocks[key]) {
        departureLocks[key].on('loaded', departures => {
            callback(departures);
        })
        return;
    }

    departureLocks[key] = new EventEmitter();
    departureLocks[key].setMaxListeners(30);

    ptvAPI.makeRequest(key, (err, data) => {
        let {departures} = data;
        departures = departures.map(departure => {
            return new Date(departure.scheduled_departure_utc);
        }).sort((a, b) => a - b);

        departureCache[key] = departures;
        departureLocks[key].emit('loaded', departures);
        delete departureLocks[key];

        callback(departures);
    });
}

function pad2(d) {
    return [0, 0].concat([...d.toString()]).slice(-2).join('');
}

function getFirstBus(routeID, routeType, stopID, directionID, day, callback) {
    getDepartures(routeID, routeType, stopID, directionID, day, departures => {
        if (!departures[0]) callback(null);
        else callback(pad2(departures[0].getHours()) + '' + pad2(departures[0].getMinutes()));
    });
}

function getLastBus(routeID, routeType, stopID, directionID, day, callback) {
    getDepartures(routeID, routeType, stopID, directionID, day, departures => {
        if (!departures[0]) callback(null);
        callback(pad2(departures.slice(-1)[0].getHours()) + '' + pad2(departures.slice(-1)[0].getMinutes()));
    });
}

function getFrequenciesInPeriod(routeID, routeType, stopID, directionID, day, timeFrame, callback) {
    let startTime = getTimeInDay(day, timeFrame.start[0], timeFrame.start[1]);
    let endTime = getTimeInDay(day, timeFrame.end[0], timeFrame.end[1]);

    getDepartures(routeID, routeType, stopID, directionID, day, departures => {
        let departuresInTimeFrame = departures.filter(departure => startTime <= departure && departure <= endTime);
        let headwaySpacings = departuresInTimeFrame.map((departure, i) => {
            if (i === 0) return -1;

                return departure - departuresInTimeFrame[i - 1];
        }).filter(headwaySpacing => headwaySpacing > 0).sort((a, b) => a - b);

        callback(headwaySpacings[0] || null, headwaySpacings.slice(-1)[0] || null);
    });
}
function getFrequencies(routeID, routeType, stopID, directionID, day, callback) {
    let promises = [];
    let timeFrames = {
        earlyMorning: {start: [0,0], end: [6,30]},
        morningPeak: {start: [6,30], end: [10,0]},
        offPeak: {start: [10,0], end: [16,30]},
        eveningPeak: {start: [16,30], end: [20,30]},
        night: {start: [20,30], end: [24,0]}
    };

    let frequencyPeriods = {};

    Object.keys(timeFrames).forEach(timeFrame => {
        promises.push(new Promise(resolve => {
            getFrequenciesInPeriod(routeID, routeType, stopID, directionID, day, timeFrames[timeFrame], (min, max) => {
                frequencyPeriods[timeFrame] = {min: min / (1000 * 60) || null, max: max / (1000 * 60) || null};
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        callback(frequencyPeriods)
    });
}

function getTimeInDay(day, hours, minutes) {
    return new Date(new Date(day.valueOf()).setHours(hours, minutes, 0, 0));
}

function nextDay(x) {
    let now = new Date();
    now.setDate(now.getDate() + (x + (7 - now.getDay())) % 7);
    now.setHours(0,0,0,0);
    return now;
}

function getNextWeekday() {
    let dayOfWeekToday = new Date().getDay();
    if (![0, 6].includes(dayOfWeekToday))
        return nextDay(dayOfWeekToday);
    return nextDay(1);
}

function getNextSaturday() {
    return nextDay(6);
}

function getNextSunday() {
    return nextDay(0);
}

module.exports = {
    getFirstBus,
    getLastBus,
    getFrequencies,

    getNextWeekday,
    getNextSaturday,
    getNextSunday
}

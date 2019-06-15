const ptvAPI = require('../../utils/ptv-api');
const trainLine = require('../../utils/train-line');
const TimedCache = require('timed-cache');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1 });

let cityLoopStations = ['southern cross', 'parliament', 'flagstaff', 'melbourne central'];

let burnleyGroup = [1, 2, 7, 9]; // alamein, belgrave, glen waverley, lilydale
let caulfieldGroup = [4, 6, 11, 12]; // cranbourne, frankston, pakenham, sandringham
let northenGroup = [3, 14, 15, 16, 17]; // craigieburn, sunbury, upfield, werribee, williamstown
let cliftonHillGroup = [5, 8]; // mernda, hurstbridge

class TrainRun {
    constructor(runData) {
        let runID = [];
        if (runData.vehicle_descriptor)
            runID = [...runData.vehicle_descriptor.id].map(e => parseInt(e)||e);

        this.destination = runData.destination_name;
        this.expressStopsCount = runData.express_stop_count;
        this.trainType = (runData.vehicle_descriptor || {}).description;

        this.throughCityLoop = runID[1] > 4 || cityLoopStations.includes(this.destination.toLowerCase());
        this.stopsViaFlindersFirst = runID[1] <= 4;
        this.upService = !(runID[3] % 2);

        this.cityStations = [];

        let routeID = runData.route_id;

        // assume up trains
        if (northenGroup.includes(routeID)) {
            if (this.stopsViaFlindersFirst && !this.throughCityLoop)
                this.cityStations = ['NME', 'SSS', 'FSS'];
            else if (this.stopsViaFlindersFirst && this.throughCityLoop)
                this.cityStations = ['SSS', 'FSS', 'PAR', 'MCE', 'FGS'];
            else if (!this.stopsViaFlindersFirst && this.throughCityLoop)
                this.cityStations = ['FGS', 'MCE', 'PAR', 'FSS', 'SSS'];
        } else {
            if (this.stopsViaFlindersFirst && this.throughCityLoop) { // flinders then loop
                if (burnleyGroup.concat(caulfieldGroup).concat(cliftonHillGroup).includes(routeID))
                    this.cityStations = ['FSS', 'SSS', 'FGS', 'MCE', 'PAR'];
            } else if (!this.stopsViaFlindersFirst && this.throughCityLoop) { // loop then flinders
                if (burnleyGroup.concat(caulfieldGroup).concat(cliftonHillGroup).includes(routeID))
                    this.cityStations = ['PAR', 'MCE', 'FSG', 'SSS', 'FSS'];
            } else if (this.stopsViaFlindersFirst && !this.throughCityLoop) { // direct to flinders
                if (routeID == 6) // frankston
                    this.cityStations = ['RMD', 'FSS', 'SSS']
                else if (burnleyGroup.concat(caulfieldGroup).includes(routeID))
                    this.cityStations = ['RMD', 'FSS'];
                else if (cliftonHillGroup.includes(routeID))
                    this.cityStations = ['JLI', 'FSS']
            }
        }

        if (!this.upService) { // down trains; away from city
            this.cityStations.reverse();
        }

        this.runID = runID.join('');
    }
}

function getTimings(trainStationID, db, callback) {
    if (timingsCache.get(trainStationID)) {
        callback(timingsCache.get(trainStationID));
        return;
    }

    ptvAPI.makeRequest('/v3/departures/route_type/0/stop/' + trainStationID + '?max_results=6&expand=run', (err, data) => {
        let timings = [];
        let promises = [];

        let lines = [];

        data.departures.forEach(departure => {
            if (departure.route_id == 99) return; // Outdated city loop line
            promises.push(new Promise(resolve => {
                trainLine.getTrainLine(departure.route_id, db, lineData => {
                    let platform = departure.platform_number;
                    let runData = new TrainRun(data.runs[departure.run_id]);
                    let destination = runData.destination;
                    let directionID = data.runs[departure.run_id].direction_id;
                    let departureTime = new Date(departure.estimated_departure_utc || departure.scheduled_departure_utc);
                    let reachedPlatform = departure.at_platform;

                    if (departure.route_id === 13) { // stony point platforms
                        if (trainStationID === 1073) platform = 3;
                        else platform = 1;
                    }

                    if (platform == null) { // show replacement bus
                        if (departure.flags.includes('RRB-RUN')) platform = 'RRB';
                        else return resolve();
                    }

                    if (new Date() - departureTime > 1000 * 60 * 1.5 || departureTime - new Date() > 1000 * 60 * 60 * 3) { // train arrives beyond 3hrs
                        return resolve();
                    }

                    let headwayDeviance = null

                    if (departure.estimated_departure_utc) {
                        headwayDeviance = (new Date(departure.scheduled_departure_utc) - new Date(departure.estimated_departure_utc)) / 1000;
                    }

                    timings.push({
                        trainLine: lineData.lineName,
                        destination,
                        directionID,
                        platform,
                        departureTime,
                        headwayDeviance,
                        reachedPlatform,
                        runData
                    });

                    timings = timings.sort((a, b) => a.departureTime - b.departureTime);

                    if (!lines.includes(lineData.lineName)) lines.push(lineData.lineName);

                    resolve();
                });
            }));
        });

        Promise.all(promises).then(() => {
            timingsCache.put(trainStationID, timings);
            callback(timings, lines.length);
        });
    });
}


module.exports = { getTimings };

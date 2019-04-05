const ptvAPI = require('../../utils/ptv-api');
const TimedCache = require('timed-cache');

let timingsCache = new TimedCache({ defaultTtl: 1000 * 60 * 1 });

let cityLoopStations = ['southern cross', 'parliament', 'flagstaff', 'melbourne central'];

class TrainRun {
    constructor(runData) {
        let runID = [];
        if (runData.vehicle_descriptor)
            runID = [...runData.vehicle_descriptor.id].map(e => parseInt(e));

        this.destination = runData.destination_name;
        this.expressStopsCount = runData.express_stop_count;
        this.trainType = (runData.vehicle_descriptor || {}).description;

        this.throughCityLoop = runID[1] > 4 || cityLoopStations.includes(this.destination.toLowerCase());
        this.stopsViaFlindersFirst = runID[1] <= 4;
        this.upService = !(runID[3] % 2);

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
                db.getCollection('train lines').findDocument({ ptvRouteID: departure.route_id }, (err, lineData) => {
                    let platform = departure.platform_number;
                    let runData = new TrainRun(data.runs[departure.run_id]);
                    let destination = runData.destination;
                    let directionID = data.runs[departure.run_id].direction_id;
                    let arrivalTime = new Date(departure.estimated_departure_utc || departure.scheduled_departure_utc);
                    let reachedPlatform = departure.at_platform;

                    if (departure.route_id === 13) {
                        if (trainStationID === 1073) platform = 3;
                        else platform = 1;
                    }

                    if (new Date() - arrivalTime > 1000 * 60 * 1.5 || arrivalTime - new Date() > 1000 * 60 * 60 * 3 || platform == null) { // train arrives beyond 3hrs
                        resolve();
                        return;
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
                        arrivalTime,
                        headwayDeviance,
                        reachedPlatform,
                        runData
                    });

                    timings = timings.sort((a, b) => a.arrivalTime - b.arrivalTime);

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

const DatabaseConnection = require('../application/database/DatabaseConnection');
const config = require('../config.json');
const request = require('request');
const tramTrackerIDData = require('./data/tramtracker-ids.json');
const levenshtein = require('fast-levenshtein');

let database = new DatabaseConnection(config.databaseURL, 'TransportVic');
let tramStops = null;

let promises = [];

function findTramStop(tramStopName, tramStopNumber, services, suburb, callback) {
    if (services.includes('3')) {
        services = services.filter(e => e !== '3').concat('3-3a');
    }

    services = services.filter((e, i, a) => a.indexOf(e) === i);

    tramStops.aggregate([
        {
            $match: {
                $or: [
                    { ttTramStopName: tramStopName },
                    { ttTramStopName: tramStopName.replace('Station', 'Railway Station') },
                    { tramStopNumber },
                    { routes: services },
                    { suburb }
                ]
            }
        },
        {
            $project: {
                ttTramStopName: "$ttTramStopName",
                score: {
                    $add: [
                        { $cond: [ { $eq: ["$ttTramStopName", tramStopName] }, 3, 0 ] },
                        { $cond: [ { $eq: ["$tramStopNumber", tramStopNumber] }, 3, -1 ] },
                        { $cond: [ { $setIsSubset: [services, "$routes"] }, 3, -1 ] },
                        { $cond: [ { $eq: ["$suburb", suburb] }, 2, 0 ] },
                    ]
                },
                _id: "$_id"
            }
        }
    ], (err, tramStops) => {
        tramStops.toArray((err, tramStops) => {
            tramStops = tramStops.map(stop => {
                let distance = levenshtein.get(stop.ttTramStopName, tramStopName);
                stop.distance = distance;
                return stop;
            });

            let groupsOfScore = tramStops.reduce((groupsOfScore, stop) => {
                if (!groupsOfScore[stop.score]) groupsOfScore[stop.score] = [];
                groupsOfScore[stop.score].push(stop);
                groupsOfScore[stop.score] = groupsOfScore[stop.score].sort((a, b) => a.distance - b.distance);

                return groupsOfScore;
            }, {});

            let sorted = [];
            Object.keys(groupsOfScore).sort((a, b) => b - a).forEach(scoreGroup => {
                sorted = sorted.concat(groupsOfScore[scoreGroup])
            });

            callback(err, sorted);
        });
    });
}

/**

Known tram stops to ignore:

Waterfront City #11 - 7099, 8008
East Preston Tram Depot #46 - 1846, 2846

*/

let ignore = [7099, 8008, 1846, 2846];

database.connect({
    poolSize: 100
}, (err) => {
    tramStops = database.getCollection('tram stops');

    tramTrackerIDData.forEach(stop => {
        if (ignore.includes(stop.tramTrackerID)) return;

        promises.push(new Promise(resolve => {
            findTramStop(stop.stopName.trim(), stop.stopNumber, stop.services, stop.suburb, (err, stops) => {
                if (!stops[0]) console.log(stop)
                let bestStopMatch = stops[0]._id;

                tramStops.updateDocument({_id: bestStopMatch}, {
                    $set: {
                        tramTrackerID: stop.tramTrackerID
                    }
                }, resolve);
            });
        }));
    });

    Promise.all(promises).then(() => {
        console.log('Updated tramtracker IDs for ' + promises.length + ' stops');
        process.exit();
    });
});

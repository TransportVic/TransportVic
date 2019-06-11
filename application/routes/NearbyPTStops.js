const express = require('express');
const router = new express.Router();

router.get('/', (req, res) => {
    res.render('nearby/pt-stops');
});

function distance(lat1, lon1, lat2, lon2) {
    var p = 0.017453292519943295;    // Math.PI / 180
    var c = Math.cos;
    var a = 0.5 - c((lat2 - lat1) * p)/2 +
          c(lat1 * p) * c(lat2 * p) *
          (1 - c((lon2 - lon1) * p))/2;

    return 12742 * Math.asin(Math.sqrt(a)); // 2 * R; R = 6371 km
}
function getClosestDistance(userPosition, positions) {
    let userLat = userPosition.latitude, userLong = userPosition.longitude;
    let distances = positions.map(position => distance(position[1], position[0], userLat, userLong));

    return distances.sort((a, b) => a - b)[0];
}

let stopNames = {
    'bus stops': 'Bus stop',
    'train stations': 'Train station',
    'tram stops': 'Tram stop'
};

let nameKey = {
    'bus stops': 'busStopName',
    'train stations': 'stationName',
    'tram stops': 'tramStopName'
}

function getNearbyStops(type, db, position, callback) {
    db.getCollection(type).findDocuments({
        location: {
            $nearSphere: {
                $geometry: {
                    type: 'Point',
                    coordinates: [position.longitude, position.latitude]
                },
                $maxDistance: 500
            }
        }
    }).toArray((err, stops) => {
        callback(stops.map(stop => {
            stop.stopType = stopNames[type];
            stop.distanceToStop = getClosestDistance(position, stop.location.coordinates);
            stop.name = stop[nameKey[type]];

            return stop;
        }));
    });
}

router.post('/', (req, res) => {
    let stopTypes = {
        busStops: 'bus stops',
        trainStations: 'train stations',
        tramStops: 'tram stops'
    };
    let allStops = [];
    let promises = [];

    Object.keys(stopTypes).forEach(stopType => {
        promises.push(new Promise(resolve => {
            getNearbyStops(stopTypes[stopType], res.db, req.body, stops => {
                allStops = allStops.concat(stops);
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        allStops = allStops.sort((a, b) => a.distanceToStop - b.distanceToStop);

        res.render('nearby/results', {
            position: req.body,
            allStops
        });
    });
});

module.exports = router;

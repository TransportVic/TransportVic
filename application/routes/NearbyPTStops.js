const express = require('express');
const router = new express.Router();

router.get('/', (req, res) => {
    res.render('nearby/pt-stops');
});

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
        callback(stops);
    });
}

router.post('/', (req, res) => {
    let stopTypes = {
        busStops: 'bus stops',
        trainStations: 'train stations',
        tramStops: 'tram stops'
    };
    let stopList = {};
    let promises = [];


    Object.keys(stopTypes).forEach(stopType => {
        promises.push(new Promise(resolve => {
            getNearbyStops(stopTypes[stopType], res.db, req.body, stops => {
                stopList[stopType] = stops;
                resolve();
            });
        }));
    });

    Promise.all(promises).then(() => {
        let allStops = [];
        Object.keys(stopTypes).forEach(stopType => {
            allStops = allStops.concat(stopList[stopType].map(stop => {
                stop.stopType = stopType;
                return stop;
            }));
        });

        res.render('nearby/results', {
            position: req.body,
            allStops
        });
    });
});

module.exports = router;

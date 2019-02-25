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
    getNearbyStops('bus stops', res.db, req.body, busStops => {
        res.render('nearby/results', {busStops, position: req.body});
    });
});

module.exports = router;

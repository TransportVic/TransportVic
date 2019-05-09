const express = require('express');
const {queryServiceData} = require('../../../utils/bus-service');
const router = new express.Router();

function flattenDest(dest) {
    return dest.replace(/[^\w]/g, '-').replace(/--+/g, '-').replace(/^-*/, '').replace(/-*$/, '').toLowerCase();
}

router.get('/:fullService', (req, res, next) => {
    queryServiceData(req.params, res.db, service => {
        if (service.length) {
            if (service.length == 2 && service[0].directionID == service[1].directionID)
                service = service.sort((a,b)=>a.destination.length - b.destination.length);
            else
                service = service.sort((a,b)=>a.directionID - b.directionID);

            res.redirect('/bus/metro/' + req.params.fullService + '/' + flattenDest(service[0].destination));
        } else next();
    })
});

router.get('/:fullService/:destination', (req, res) => {
    queryServiceData({
        fullService: req.params.fullService
    }, res.db, service => {
        let mainDirection = service.filter(direction => flattenDest(direction.destination) === req.params.destination)[0];
        if (!mainDirection) {
            res.redirect('/bus/metro/' + req.params.fullService);
            return;
        }

        let otherDirection = service.filter(e => e !== mainDirection)[0] || mainDirection;
        let data = {service: mainDirection};
        if (service.length == 2) {
            data.otherDest = otherDirection.destination;
        }

        let termini = [(otherDirection || mainDirection).stops[0], mainDirection.stops[0]];
        res.db.getCollection('bus stops').findDocuments({
            $or: termini.map(busStop => {return {
                busStopCodes: busStop.busStopCode
            }})
        }).toArray((err, fullTermini) => {
            let mainTerminus = fullTermini.filter(terminus => terminus.busStopCodes.includes(termini[0].busStopCode))[0];
            let otherTerminus = fullTermini.filter(terminus => terminus !== mainTerminus)[0] || mainTerminus;
            data.termini = [mainTerminus, otherTerminus];

            res.render('service-info/metro-bus', data);
        });
    })
});

module.exports = router;

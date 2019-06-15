const express = require('express');
const { getTrainLine, loadTrainLineDataIfNeeded } = require('../../../utils/train-line');
const router = new express.Router();

router.get('/:cleanLineName', (req, res) => {
    res.redirect('/metro/' + req.params.cleanLineName + '/down');
});

router.get('/:cleanLineName/:direction', (req, res, next) => {
    getTrainLine(req.params.cleanLineName, res.db, line => {
        if (!line) return next();
        if (!['up', 'down'].includes(req.params.direction)) return next();
        loadTrainLineDataIfNeeded(line, res.db, lineData => {
            res.render('service-info/metro-train', {lineData, data: req.params})
        });
    });
});

module.exports = router;

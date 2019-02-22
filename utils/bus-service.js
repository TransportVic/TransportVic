function getServiceNumber(service) {
    if (service.startsWith('Telebus'))
        return 'Telebus'
    return service.replace(/[A-Za-z#]/g, '');
}

function getServiceVariant(service) {
    if (service.startsWith('Telebus'))
        return service.match(/([0-9]+)/)[1];
    return service.replace(/[0-9]/g, '');
}

function adjustDestination(dest) {
    if (dest.includes('Monash University')) {
        let campus = dest.match(/\((\w+)/);
        campus = campus ? campus[1] : 'Clayton';

        return `Monash University (${campus} Campus)`;
    }

    return dest;
}

module.exports = {
    getServiceNumber,
    getServiceVariant,
    adjustDestination
};

function isCityStation(destination, filter) {
    if (filter == 'city') {
        return ['southern cross', 'parliament', 'flagstaff', 'melbourne central', 'flinders street'].includes(destination);
    }
    return false;
}

$.ready(() => {
    $('#filter').on('input', () => {
        let filter = $('#filter').value.toLowerCase();
        let allArrivals = Array.from(document.querySelectorAll('.trainService'));

        allArrivals.forEach(arrivalDiv => {
            let destination = arrivalDiv.getAttribute('destination');
            let platform = arrivalDiv.getAttribute('platform');
            if (destination.includes(filter) || isCityStation(destination, filter) || platform == filter) {
                arrivalDiv.style.display = 'flex';
            } else {
                arrivalDiv.style.display = 'none';
            }
        });
    });
});

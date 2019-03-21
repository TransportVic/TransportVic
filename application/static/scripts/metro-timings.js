function isCityStation(destination, filter) {
    if (filter == 'city') {
        return ['southern cross', 'parliament', 'flagstaff', 'melbourne central', 'flinders street'].includes(destination);
    }
    return false;
}

$.ready(() => {
    $('#destination').on('input', () => {
        let destinationFilter = $('#destination').value.toLowerCase();
        let allArrivals = Array.from(document.querySelectorAll('.trainService'));

        allArrivals.forEach(arrivalDiv => {
            let destination = arrivalDiv.getAttribute('destination');
            if (destination.includes(destinationFilter) || isCityStation(destination, destinationFilter)) {
                arrivalDiv.style.display = 'flex';
            } else {
                arrivalDiv.style.display = 'none';
            }
        });
    });
});

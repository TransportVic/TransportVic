function processPosition(position) {
    let {coords} = position;
    let {latitude, longitude} = coords;

    $.ajax({
        method: 'POST',
        data: {
            latitude, longitude
        }
    }, (status, data) => {
        $('#content').innerHTML = data;
    });
}

function onError(error) {

}

$.ready(() => {
    window.navigator.geolocation.watchPosition(processPosition, onError, {
        enableHighAccuracy: true
    });
});

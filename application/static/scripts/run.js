$.ready(() => {
    $(`#stops .departure:nth-child(${anchorStop + 2})`).scrollIntoView({behavior: 'smooth'});
});

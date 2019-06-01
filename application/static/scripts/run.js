$.ready(() => {
    window.scrollTo(0, 0);
    $(`#stops .departure:nth-child(${anchorStop + 2})`).scrollIntoView({behavior: 'smooth'});
});

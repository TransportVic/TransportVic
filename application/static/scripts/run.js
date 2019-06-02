$.ready(() => {
    window.scrollTo(0, 0);
    setTimeout(() => {
        $(`#stops .departure:nth-child(${anchorStop + 2})`).scrollIntoView({behavior: 'smooth'});
    }, 10);
});

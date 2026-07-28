const QUAKE_CENTER = { lat: 33.5912646, lon: 130.3986278 };
const QUAKE_CENTER_NAME = "Akasaka, Fukuoka";
const QUAKE_RADIUS_KM = 300;
const QUAKE_MIN_MAG = 1.5;
const QUAKE_DAYS = 28;

function timeAgo(ms) {
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 60) return mins + "m ago";
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.round(hrs / 24) + "d ago";
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function magClass(mag) {
    if (mag >= 5) return "quake-high";
    if (mag >= 4) return "quake-mid";
    return "quake-low";
}

function renderQuakes() {
    const el = document.getElementById("quakeList");
    const end = new Date();
    const start = new Date(end.getTime() - QUAKE_DAYS * 86400000);
    const url = "https://earthquake.usgs.gov/fdsnws/event/1/query" +
        "?format=geojson" +
        "&starttime=" + start.toISOString().slice(0, 10) +
        "&endtime=" + end.toISOString().slice(0, 10) +
        "&latitude=" + QUAKE_CENTER.lat +
        "&longitude=" + QUAKE_CENTER.lon +
        "&maxradiuskm=" + QUAKE_RADIUS_KM +
        "&minmagnitude=" + QUAKE_MIN_MAG +
        "&orderby=time&limit=15";

    fetch(url)
        .then((res) => { if (!res.ok) throw new Error(res.status); return res.json(); })
        .then((data) => {
            if (!data.features.length) {
                el.innerHTML = '<p class="quake-empty">No M' + QUAKE_MIN_MAG + '+ quakes in the last ' + QUAKE_DAYS + ' days.</p>';
            } else {
                el.innerHTML = data.features.map((f) => {
                    const p = f.properties;
                    const depth = f.geometry.coordinates[2];
                    const dist = distanceKm(
                        QUAKE_CENTER.lat, QUAKE_CENTER.lon, f.geometry.coordinates[1], f.geometry.coordinates[0]
                    );
                    return (
                        '<a class="quake-row" href="' + p.url + '" target="_blank" rel="noopener">' +
                        '<span class="quake-mag ' + magClass(p.mag) + '">M' + p.mag.toFixed(1) + '</span>' +
                        '<span class="quake-info">' +
                        '<span class="quake-place">' + p.place + '</span>' +
                        '<span class="quake-meta">' + '<b>' + timeAgo(p.time) + '</b> &middot; Depth: <b>' +
                        depth.toFixed(0) + 'km</b> &middot; Distance from ' + QUAKE_CENTER_NAME + ': <b>~' +
                        dist.toFixed(0) + 'km</b> </span>' +
                        '</a>'
                    );
                }).join("");
            }
            checkAftershockForecast(data.features);
        })
        .catch(() => {
            el.innerHTML = '<p class="quake-empty">Earthquake data unavailable.</p>';
            document.getElementById("aftershockBox").innerHTML =
                '<p class="quake-empty">Aftershock forecast unavailable.</p>';
        });
}

function checkAftershockForecast(features) {
    const box = document.getElementById("aftershockBox");
    if (!features || !features.length) {
        box.innerHTML = '<p class="quake-empty">No recent mainshock.</p>';
        return;
    }

    // Use the largest quake in the window as the candidate mainshock.
    const mainshock = features.reduce((biggest, f) =>
        f.properties.mag > biggest.properties.mag ? f : biggest
    );

    if (mainshock.properties.mag < 4.5) {
        box.innerHTML = '<p class="quake-empty">Recent quake (M' +
            mainshock.properties.mag.toFixed(1) + ') is below USGS forecasts issueing threshold.</p>';
        return;
    }

    fetch(mainshock.properties.detail)
        .then((res) => res.json())
        .then((detail) => {
            const oaf = detail.properties.products && detail.properties.products.oaf;
            const forecastFile = oaf && oaf[0].contents && oaf[0].contents["forecast.json"];
            if (!forecastFile) {
                box.innerHTML =
                    '<p class="quake-empty">Aftershock forecast for <b>M' + mainshock.properties.mag.toFixed(1) +
                    '</b> event in <b>' + mainshock.properties.place +
                    '</b> has not published. </p>';
                return;
            }
            return fetch(forecastFile.url).then((r) => r.json()).then((fc) => renderForecast(fc, mainshock));
        })
        .catch(() => {
            box.innerHTML = '<p class="quake-empty">Aftershock forecast unavailable.</p>';
        });
}

function renderForecast(fc, mainshock) {
    const box = document.getElementById("aftershockBox");
    if (!fc.forecast || !fc.forecast.length) {
        box.innerHTML = '<p class="quake-empty">No aftershock forecast data available.</p>';
        return;
    }

    const rows = fc.forecast.map((window) => {
        const bins = (window.bins || [])
            .filter((b) => [3, 4, 5].includes(Math.round(b.magnitude)))
            .map((b) => 'M' + Math.round(b.magnitude) + '+: ' + (b.probability * 100).toFixed(0) + '%')
            .join(" &middot; ");
        return '<div class="af-row"><span class="af-label">' + window.label + '</span><span class="af-probs">' + bins + '</span></div>';
    }).join("");

    box.innerHTML =
        '<p class="af-source">Based on the M' + mainshock.properties.mag.toFixed(1) + ' event in ' +
        mainshock.properties.place + '</p>' + rows;
}

renderQuakes();
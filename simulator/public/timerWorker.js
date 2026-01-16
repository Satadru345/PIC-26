/* simulator/public/timerWorker.js */
let timerID = null;

self.onmessage = function(e) {
    if (e.data === "START") {
        if (!timerID) {
            // We use 1000ms here because your App.js uses 1000ms
            timerID = setInterval(() => {
                postMessage("TICK");
            }, 1000); 
        }
    } else if (e.data === "STOP") {
        if (timerID) {
            clearInterval(timerID);
            timerID = null;
        }
    }
};
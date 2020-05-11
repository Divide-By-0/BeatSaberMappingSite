// JavaScript adaptation of https://github.com/lucienmaloney/BeatSaber.jl/blob/master/src/BeatSaber.jl

function getflux(data, samplerate) {
  const fft = new FFT(2048, samplerate);
  const flux = [];
  let spectrum = new Float64Array(1024);
  for (let i = 0; i < data.length - 2048; i += 256) {
    fft.forward(data.slice(i, i + 2048));
    let x = 0;
    for (let j = 0; j < 1024; j++) {
      const diff = fft.spectrum[j] - spectrum[j];
      x += diff > 0 ? diff : 0;
    }
    flux.push(x);
    spectrum = fft.spectrum.slice(0, 1024);
  }
  return flux;
}

function rolling(arr, l) {
  const roll = [];
  let x = arr.slice(0, l).reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) {
    const b1 = (i - (l + 1)) >= 0 ? arr[i - (l + 1)] : 0;
    const b2 = (i + l) < arr.length ? arr[i + l] : 0;
    x = x - b1 + b2;
    roll.push(x / (l * 2 + 1));
  }
  return roll;
}

function gettimestamps(data, samplerate) {
  const notetimes = [];
  const flux = getflux(data, samplerate);
  const smoothflux = rolling(flux, 5);
  const rollingavg = rolling(flux, 40);
  let count = 16;

  for (let i = 1; i < flux.length - 1; i++) {
    if (smoothflux[i] > smoothflux[i - 1] && smoothflux[i] > smoothflux[i + 1] && smoothflux[i] > (rollingavg[i] * 1.1 + 0.01) && count > 15) {
      count = 0;
      const time = 2 + (i * 256 / samplerate);
      notetimes.push(time);
    } else {
      count++;
    }
  }
  return notetimes;
}

function getnotedata(note, color = 0) {
  const x = note % 4;
  const y = Math.floor(note / 4) % 3;
  const direction = Math.floor(note / 12);

  if (color == 0) {
    return [x, y, direction];
  } else {
    const directions = [0, 1, 3, 2, 5, 4, 7, 6, 8];
    return [3 - x, y, directions[direction]]
  }
}

function createnote(x, y, direction, color, time) {
  return {
    "_time": time,
    "_cutDirection": direction,
    "_type": color,
    "_lineLayer": y,
    "_lineIndex": x,
  };
}

function createnotefromindex(note, color, time) {
  return createnote(...getnotedata(note, color), color, time);
}

function randbool() {
  return !Math.floor(Math.random() * 2)
}

function weightedrandom(weights) {
  const sum = weights.reduce((a, b) => a + b);
  const rand = Math.random() * sum;
  let rolling = 0;
  for (let i = 0; i < weights.length; i++) {
    rolling += weights[i];
    if (rolling > rand) {
      return i;
    }
  }
  return 1;
}

function timestonotes(notetimes) {
  const notesb = [1, 1];
  const notesa = [13, 13];
  const notesequence = [];
  let prevcolor = randbool();

  function pushnote(color, t, deltat) {
    let weights = [];
    for (let i = 0; i < 96; i++) {
      weights[i] = notesallowed[i] *
                   samecolor[notesb[0 + color] * 96 + i] *
                   diffcolor[notesb[1 - color] * 96 + i] *
                   samecolor2[notesa[0 + color] * 96 + i] *
                   diffcolor2[notesa[1 - color] * 96 + i];
    }

    weights[notesb[1 - color]] *= 100;
    const cap = deltat < 0.2 ? 2000 / (deltat ** 2) : 50000;
    weights = weights.map(x => Math.min(x, cap));
    const power = deltat > 0.2 ? 0.5 : 0.5 + 0.5 * (0.2 - deltat) / 0.2;

    note = weightedrandom(weights.map(x => x ** power));

    notesa[0 + color] = notesb[0 + color];
    notesb[0 + color] = note;
    prevcolor = color;
    notesequence.push(createnotefromindex(note, 0 + color, t));
  }

  let t = 0;
  let timediff = 0;

  for (let i = 0; i < notetimes.length; i++) {
    const newtime = notetimes[i];
    timediff = newtime - t;
    if (timediff < 0.2) {
      pushnote(!prevcolor, newtime, timediff);
    } else if (Math.random() < 0.3) {
      pushnote(randbool(), newtime, timediff);
      pushnote(!prevcolor, newtime, timediff);
    } else {
      pushnote(randbool(), newtime, timediff);
    }
    t = newtime;
  }

  return notesequence;
}

function createbeatmapJSON(notetimes) {
  return {
    "_version": "2.0.0",
    "_BPMChanges": [],
    "_events": [],
    "_notes": timestonotes(notetimes),
    "_obstacles": [],
    "_bookmarks": [],
  };
}

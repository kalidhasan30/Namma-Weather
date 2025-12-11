// FINAL script.js

// -------- Helpers --------
function showSpinner(show){ const s=document.getElementById('spinner'); if(s) s.style.display = show ? 'block' : 'none'; }
function showError(msg){ const r=document.getElementById('results'); if(r) r.innerHTML = `<div class="error">${msg}</div>`; }
function formatDate(dt){ try { return dt.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}); } catch(e){ return dt.toString(); } }
function debounce(fn,delay=250){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),delay); }; }

// -------- Emojis --------
function weatherEmoji(main){
  switch(main){
    case 'Clear': return '☀️';
    case 'Clouds': return '⛅';
    case 'Rain': return '🌧️';
    case 'Drizzle': return '🌦️';
    case 'Thunderstorm': return '⛈️';
    case 'Snow': return '❄️';
    case 'Mist': return '🌫️';
    default: return '🌡️';
  }
}

// -------- Photon geocoding (suggestions) --------
async function photonSearch(q,limit=8){
  if(!q||!q.trim()) return [];
  try{
    const emailParam = (typeof CONTACT_EMAIL !== 'undefined' && CONTACT_EMAIL) ? `&email=${encodeURIComponent(CONTACT_EMAIL)}` : '';
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&countrycodes=in&q=${encodeURIComponent(q)}${emailParam}`;
    const r = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if(!r.ok) return [];
    const items = await r.json();
    return items.map(it => {
      const addr = it.address || {};
      return {
        geometry: { coordinates: [parseFloat(it.lon), parseFloat(it.lat)] },
        properties: {
          name: it.display_name || (addr.city || addr.town || addr.village || ''),
          city: addr.city || addr.town || addr.village || '',
          state: addr.state || '',
          country: addr.country || 'India',
          type: addr.city ? 'city' : (addr.town ? 'town' : (addr.village ? 'village' : 'place'))
        }
      };
    });
  } catch (e) { console.warn('suggestions fetch failed', e); return []; }
}

// Use photon/komoot for geocoding when selecting final place
async function getCoordinates(query){
  const url=`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en`;
  const r=await fetch(url);
  if(!r.ok) throw new Error('Geocoding failed');
  const d=await r.json();
  if(!d.features||!d.features.length) throw new Error('Place not found');
  const pref=d.features.find(f=>['city','town','village','hamlet','suburb'].includes(f.properties.type));
  const best=pref||d.features[0];
  return { lat: best.geometry.coordinates[1], lon: best.geometry.coordinates[0], name: best.properties.name || best.properties.city || best.properties.county || query };
}

// -------- Floating suggestions UI (keeps working) --------
function createFloatingBox(){
  const el=document.createElement('div');
  el.className='floating-suggestions';
  Object.assign(el.style,{position:'fixed',zIndex:99999,background:'#fff',borderRadius:'10px',boxShadow:'0 12px 40px rgba(0,0,0,0.12)',display:'none',maxHeight:'260px',overflowY:'auto'});
  document.body.appendChild(el);
  return el;
}
function showFloatingBox(box,inputEl,html){
  const rect=inputEl.getBoundingClientRect();
  box.innerHTML=html;
  box.style.minWidth = Math.max(240, rect.width) + 'px';
  box.style.left = rect.left + 'px';
  const below = (window.innerHeight - rect.bottom) > 140;
  if(below) box.style.top = (rect.bottom + 6) + 'px', box.style.bottom = 'auto';
  else box.style.top = 'auto', box.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  box.style.display = 'block';
}
function hideFloatingBox(box){ box.style.display='none'; box.innerHTML=''; }

function attachFloatingAutocomplete(inputId){
  const input=document.getElementById(inputId);
  if(!input) return;
  const box=createFloatingBox();
  const update = debounce(async ()=>{
    const q=input.value.trim();
    delete input.dataset.lat; delete input.dataset.lon;
    if(!q){ hideFloatingBox(box); return; }
    const features = await photonSearch(q,8);
    if(!features.length){ hideFloatingBox(box); return; }
    const html = features.map(f=>{
      const name=f.properties.name||f.properties.city||'';
      const sub=[f.properties.city,f.properties.state,f.properties.country].filter(Boolean).join(', ');
      return `<div class="suggestion-item" data-lat="${f.geometry.coordinates[1]}" data-lon="${f.geometry.coordinates[0]}" data-name="${(name||'').replace(/"/g,'&quot;')}" style="padding:10px 12px;border-bottom:1px solid rgba(0,0,0,0.04);cursor:pointer;">
        <div style="font-weight:600">${name}</div>
        <div style="font-size:0.85rem;color:#666;margin-top:4px;">${sub}</div>
      </div>`;
    }).join('');
    showFloatingBox(box,input,html);
    box.querySelectorAll('.suggestion-item').forEach(item=>{
      item.addEventListener('pointerdown',ev=>{
        ev.preventDefault();
        input.value = item.dataset.name || input.value;
        input.dataset.lat = item.dataset.lat;
        input.dataset.lon = item.dataset.lon;
        hideFloatingBox(box);
        setTimeout(()=>input.focus(),0);
      });
    });
  },200);
  input.addEventListener('input', update);
  input.addEventListener('blur', ()=>setTimeout(()=>hideFloatingBox(box),180));
  window.addEventListener('resize', ()=>{ if(box.style.display!=='none'){ const r=input.getBoundingClientRect(); showFloatingBox(box,input,box.innerHTML); } });
  window.addEventListener('scroll', ()=>{ if(box.style.display!=='none'){ const r=input.getBoundingClientRect(); showFloatingBox(box,input,box.innerHTML); } }, true);
}

// -------- Weather mapping & fetch (unchanged) --------
const CODE_MAP = {
  0:["Clear","Clear sky"],1:["Clouds","Mainly clear"],2:["Clouds","Partly cloudy"],3:["Clouds","cloudy"],
  45:["Mist","Fog"],48:["Mist","Rime fog"],51:["Drizzle","Light drizzle"],53:["Drizzle","Moderate drizzle"],55:["Drizzle","Dense drizzle"],
  61:["Rain","Slight rain"],63:["Rain","Moderate rain"],65:["Rain","Heavy rain"],80:["Rain","Light showers"],81:["Rain","Moderate showers"],82:["Rain","Heavy showers"],
  95:["Thunderstorm","Thunderstorm"],96:["Thunderstorm","Thunderstorm (hail)"],99:["Thunderstorm","Thunderstorm (heavy hail)"]
};
function mapCode(code){ return CODE_MAP[code] || ["Unknown","Unknown"]; }

async function getCurrentWeather(lat,lon){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
  const r=await fetch(url);
  const d=await r.json();
  const cw = d.current_weather || {};
  const [main,desc] = mapCode(cw.weathercode);
  return { temp:cw.temperature, humidity:'N/A', main, desc, dt: new Date(cw.time || Date.now()) };
}

async function getForecastAtTime(lat,lon,etaDate){
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relativehumidity_2m,weathercode&timezone=auto`;
  const r=await fetch(url);
  const d=await r.json();
  const times=d.hourly.time, temps=d.hourly.temperature_2m, hums=d.hourly.relativehumidity_2m, codes=d.hourly.weathercode;
  let best=0, bestDiff=Infinity;
  for(let i=0;i<times.length;i++){
    const diff=Math.abs(new Date(times[i]) - etaDate);
    if(diff < bestDiff){ bestDiff = diff; best = i; }
  }
  const [main,desc] = mapCode(codes[best]);
  return { temp:temps[best], humidity:hums[best], main, desc, dt: new Date(times[best]) };
}

// -------- ETA rounding (same) --------
function roundToNearest30(date){
  let m=date.getMinutes(), h=date.getHours();
  if(m<=14) m=0; else if(m<=44) m=30; else { m=0; h+=1; }
  date.setHours(h); date.setMinutes(m); date.setSeconds(0); date.setMilliseconds(0);
  return date;
}

// -------- Map rendering (ensure invalidateSize) --------
function renderMap(start,dest,routeCoords){
  const mapEl=document.getElementById('map'); if(mapEl) mapEl.style.display='block';
  if(!window.__nm_map){ window.__nm_map = L.map('map',{zoomControl:true}).setView([start.lat,start.lon],10); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(window.__nm_map); }
  const map = window.__nm_map;
  // allow layout to settle if container was hidden
  try{ setTimeout(()=>{ map.invalidateSize(); }, 200); }catch(e){}
  if(window.__nm_layers) window.__nm_layers.forEach(l=>map.removeLayer(l));
  window.__nm_layers = [];
  const s = L.marker([start.lat,start.lon]).addTo(map);
  const d = L.marker([dest.lat,dest.lon]).addTo(map);
  const poly = L.polyline(routeCoords,{color:'#2193b0',weight:5}).addTo(map);
  window.__nm_layers.push(s,d,poly);
  try{ 
    map.fitBounds(poly.getBounds(),{padding:[40,40]});
    setTimeout(()=>{ try{ map.invalidateSize(); }catch(e){} }, 250);
  }catch(e){console.warn('fitBounds',e);} 
}

// -------- Main showRoute (changes: ETA formatting) --------
async function showRoute(){
  const sVal = document.getElementById('start').value.trim();
  const dVal = document.getElementById('dest').value.trim();
  if(!dVal) return showError('Please enter a destination');

  const resultsBox = document.getElementById('results');
  const resultsPane = document.querySelector('.results-pane');
  const mainEl = document.querySelector('.main');
  
  resultsBox.innerHTML = ''; // clear old
  showSpinner(true);
  
  // Show results pane and update layout
  if(resultsPane) resultsPane.classList.add('visible');
  if(mainEl) mainEl.classList.add('results-visible');

  try{
    // START coords
    const sEl = document.getElementById('start');
    let start, startName;
    if(!sVal){
      if(!navigator.geolocation) throw new Error('Geolocation not supported');
      const pos = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej));
      start = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      startName = 'Your Location';
    } else if(sEl.dataset.lat){
      start = { lat: parseFloat(sEl.dataset.lat), lon: parseFloat(sEl.dataset.lon) };
      startName = sEl.value;
    } else {
      const g = await getCoordinates(sVal);
      start = { lat: g.lat, lon: g.lon }; startName = g.name;
    }

    // DEST coords
    const dEl = document.getElementById('dest');
    let dest, destName;
    if(dEl.dataset.lat){
      dest = { lat: parseFloat(dEl.dataset.lat), lon: parseFloat(dEl.dataset.lon) };
      destName = dEl.value;
    } else {
      const g = await getCoordinates(dVal);
      dest = { lat: g.lat, lon: g.lon }; destName = g.name;
    }

    // ROUTING
    let dist = 0, travelMin = 0;
    let routeCoords = [[start.lat,start.lon],[dest.lat,dest.lon]];
    let arrival = new Date();
    let source = 'OSRM';
    try{
      const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`;
      const r = await fetch(url);
      const d = await r.json();
      if(!d.routes || !d.routes.length) throw new Error('OSRM no route');
      dist = d.routes[0].distance / 1000;
      travelMin = Math.round(d.routes[0].duration / 60);
      arrival = new Date(Date.now() + d.routes[0].duration * 1000);
      roundToNearest30(arrival); // immediate rounding
      if(d.routes[0].geometry && d.routes[0].geometry.coordinates) routeCoords = d.routes[0].geometry.coordinates.map(([lon,lat])=>[lat,lon]);
    }catch(err){
      source = 'Estimated';
      const R=6371, toRad=v=>v*Math.PI/180;
      const dLat = toRad(dest.lat - start.lat), dLon = toRad(dest.lon - start.lon);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(start.lat))*Math.cos(toRad(dest.lat))*Math.sin(dLon/2)**2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      dist = R*c;
      let sp = dist<20?30:dist>100?60:45;
      travelMin = Math.max(1, Math.round(dist/sp*60));
      arrival = new Date(Date.now() + travelMin*60000);
      roundToNearest30(arrival);
    }

    // FORMAT travelMin -> hours + minutes string
    let hours = Math.floor(travelMin / 60);
    let mins = travelMin % 60;
    let travelStr = '';
    if(hours > 0 && mins > 0) travelStr = `${hours} hr ${mins} min`;
    else if(hours > 0) travelStr = `${hours} hr`;
    else travelStr = `${mins} min`;

    const roundedETA = new Date(arrival); // already mutated by roundToNearest30

    // WEATHER (start now + dest at rounded ETA)
    const nowW = await getCurrentWeather(start.lat, start.lon);
    let etaW;
    try { etaW = await getForecastAtTime(dest.lat, dest.lon, roundedETA); }
    catch(e){ console.warn('forecast fail', e); etaW = await getCurrentWeather(dest.lat, dest.lon); }

    // BUILD CARD and append into #results
    const card = document.createElement('div');
    card.className = 'results-card';
    card.innerHTML = `
      <button class="close-btn" style="position:absolute;top:10px;right:15px;font-size:1.4rem;">×</button>
      <div style="text-align:center;font-weight:bold;color:var(--accent)">
        Distance: ${dist.toFixed(1)} km • ETA: ${formatDate(arrival)} (${travelStr})
        <br><small style="color:#555">${source}</small>
      </div>
      <div style="text-align:center;margin-top:10px;font-size:1.05rem;"><b>${startName} → ${destName}</b></div>

      <div class="weather-card">
        <div class="weather-title">${startName} (Now)</div>
        <div class="weather-info">${weatherEmoji(nowW.main)} ${nowW.temp}°C<br>📝 ${nowW.desc}<br>🕒 ${formatDate(nowW.dt)}</div>
      </div>

      <div class="weather-card">
        <div class="weather-title">${destName} (At ETA)</div>
        <div class="weather-info">${weatherEmoji(etaW.main)} ${etaW.temp}°C<br>💧 ${etaW.humidity}%<br>📝 ${etaW.desc}<br>🕒 ${formatDate(etaW.dt)}</div>
      </div>
    `;
    resultsBox.appendChild(card);
    card.querySelector('.close-btn').onclick = ()=>card.remove();

    // Render map
    renderMap(start,dest,routeCoords);

  }catch(err){
    console.error(err);
    showError(err.message || 'An error occurred');
  }finally{
    showSpinner(false);
  }
}

// -------- Bindings --------
attachFloatingAutocomplete('start');
attachFloatingAutocomplete('dest');
const routeBtn = document.getElementById('routeBtn');
if (routeBtn) routeBtn.addEventListener('click', showRoute);
const locBtn = document.getElementById('locBtn');
if (locBtn) locBtn.addEventListener('click', () => {
  const s = document.getElementById('start');
  if (s) { s.value = ''; delete s.dataset.lat; delete s.dataset.lon; }
  showRoute();
});

var OWMWidget = function (options, mapoptions, couchmapoptions) {
  var widget = {};
  var options = L.extend({
    divId: 'map',
    getPopupHTML: function (nodedata) {return '<strong>'+nodedata.hostname+'</strong>';},
    onBboxChange: function () {}
  }, options);
  var mapoptions = L.extend({
    worldCopyJump: true
  }, mapoptions);
  function getColor(val, bad, good) {
    var colors = ['#D50000', '#D5A200', '#CCD500', '#00D500'];
    var index = Math.floor( colors.length * (val - bad)/(good - bad) );
    index = Math.max(0, Math.min(colors.length-1, index));
    return colors[index];
  }
  var couchmapoptions = L.extend({
    nodesUrl: 'view_nodes',
    nodesUrlSpatial: 'view_nodes_spatial',
    nodesUrlCoarse: 'view_nodes_coarse',
    nodeAdd: function(nodedata, layer) {
      var mtime = new Date(nodedata.mtime);
      var time = new Date();
      var timediff = time-mtime;
      if (timediff<0) {
        timediff=0;
      }
      timediff /= 1000*60*60*24;
      var color = getColor(timediff, 4, 0);

      /* unfortunately, this does not work because markercluster
       * seems to need a marker (and not a circleMarker)
      return L.circleMarker(nodedata.latlng,
        {
          title: nodedata.hostname,
          radius: 15,
          color: color
        })
      .bindPopup(options.getPopupHTML(nodedata)).addTo(layer);
      */
      return L.marker(nodedata.latlng,
        {
          title: nodedata.hostname,
          icon: L.icon( {iconUrl: 'images/node_circle.svg', iconSize: [30,30], iconAnchor: [15,15]})
        })
        .bindPopup(options.getPopupHTML(nodedata)).addTo(layer);
    },
    nodeFilter: function(nodedata) {
      // ignore this node if mtime older than 7 days
      var date = new Date();
      date.setHours(date.getHours() - 24*7);
      var nodedate = new Date(nodedata['mtime']);
      return nodedate > date;
    },
    linkAdd: function(node1, node2, layer) {
      // ignore this link if distance > 50km
      var latlng1 = new L.LatLng(node1.data.latlng[0], node1.data.latlng[1]),
          distance = Math.round(latlng1.distanceTo(node2.data.latlng));
      if (distance > 5e4) {
        return;
      }

      var quality1 = -1;
      var quality2 = -1;
      // find qualities and pick best (does this make sense?)
      if (node1.data.links) {
        for (var i=0, link; link=node1.data.links[i++];) {
          if (link.id == node2.data.id && link.quality) {
            quality1 = link.quality;
          }
        }
      }
      if (node2.data.links) {
        for (var i=0, link; link=node2.data.links[i++];) {
          if (link.id == node1.data.id && link.quality) {
            quality2 = link.quality;
          }
        }
      }
      // check out of bounds
      function validate_quality(q) {
        return Math.min(1, Math.max(0, q));
      }
      var quality = validate_quality( Math.max(quality1, quality2) );

      var color = getColor(quality, 0, 1)
      var opacity = 0.25 + 0.5*quality;

      var html = '<h3>'
            + node1.data.hostname
            + ' ↔ '
            + node2.data.hostname
            + '</h3>'
            + '<strong>Distance:</strong> '
            + distance
            + 'm';
      if (quality1 > -1) {
        quality1 = validate_quality(quality1);
        html += '<br><strong>Quality</strong> (as reported by '
          + node1.data.hostname+'): '
          + quality1;
      }
      if (quality2 > -1) {
        quality2 = validate_quality(quality2);
        html += '<br><strong>Quality</strong> (as reported by '
          + node2.data.hostname+'): '
          + quality2;
      }

      return L.polyline([node1.data.latlng, node2.data.latlng],
          {color: color, opacity: opacity})
        .bindPopup(html).addTo(layer);
    }
  }, couchmapoptions);

  widget.map = L.map(options['divId'], mapoptions);

  var tile_lyrk = L.tileLayer('http://tiles.lyrk.org/ls/{z}/{x}/{y}?apikey={key}', {
      key: 'ce4ebc2a30064ca19ec3ccc898486c17',
      styleId: 997,
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://lyrk.de/">Lyrk</a>'
      }).addTo( widget.map );
  // https://raw.github.com/shramov/leaflet-plugins/master/layer/tile/Bing.js
  var tile_bing = new L.BingLayer("ArewtcSllazYp52r7tojb64N94l-OrYWuS1GjUGeTavPmJP_jde3PIdpuYm24VpR");

  var couchmap = new L.CouchMap(couchmapoptions);
  var couchlayers = couchmap.getLayers();

  widget.map.addLayer(couchlayers['nodes']).addLayer(couchlayers['links']);
  widget.control_layers = L.control.layers(
      {
        "Lyrk OSM": tile_lyrk,
        "Bing satellite": tile_bing
      },
      {
        "Nodes": couchlayers['nodes'],
        "Links": couchlayers['links']
      }
    ).addTo(widget.map);

  widget.control_scale = L.control.scale({imperial: false, maxWidth: 150, position: 'bottomright'})
    .addTo(widget.map);
  widget.map.attributionControl.addAttribution('Nodes+Links &copy; <a href="http://openwifimap.net">OpenWiFiMap</a> contributors under <a href="http://opendatacommons.org/licenses/odbl/summary/">ODbL</a>');

  widget.map.on('moveend', function() {
      var b = widget.map.getBounds(),
          sw = b.getSouthWest(),
          ne = b.getNorthEast();
      options.onBboxChange([sw.lat, sw.lng, ne.lat, ne.lng])
  });

  widget.fitBbox = function(bbox) {
    // nasty hack: shrink the bbox a bit, so we don't zoom out
    var h = bbox[1][0] - bbox[0][0];
    var w = bbox[1][1] - bbox[0][1];
    var eps = 0.05;
    bbox[0][0] += eps*h;
    bbox[0][1] += eps*w;
    bbox[1][0] -= eps*h;
    bbox[1][1] -= eps*w;

    widget.map.fitBounds(bbox);
  }

  return widget;
}

function getBboxFromString(str) {
  var arr = str.split(',');
  var valid = false;
  if ( arr.length >= 4 ) {
    valid = true;
    for ( i = 0; i < 4; i++ ) {
      arr[i] = parseFloat(arr[i]);
      valid = valid ? isFinite(arr[i]) : false;
    }
  }
  arr = [[arr[0],arr[1]],[arr[2],arr[3]]];
  return valid ? arr : null;
}


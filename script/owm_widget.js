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
  var couchmapoptions = L.extend({
    nodesUrl: 'view_nodes',
    nodesUrlSpatial: 'view_nodes_spatial',
    nodesUrlCoarse: 'view_nodes_coarse',
    nodeAdd: function(nodedata, layer) {
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

      return L.polyline([node1.data.latlng, node2.data.latlng], 
          {color: '#85e805'})
        .bindPopup(
            'distance '
            + node1.data.hostname
            + ' ↔ '
            + node2.data.hostname
            + ': <br>'
            + distance
            + ' meters'
        ).addTo(layer);
    }
  }, couchmapoptions);
  
  widget.map = L.map(options['divId'], mapoptions);
  
  var tile_cloudmade = L.tileLayer('http://{s}.tile.cloudmade.com/{key}/{styleId}/256/{z}/{x}/{y}.png', {
      key: 'e4e152a60cc5414eb81532de3d676261',
      styleId: 997,
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://cloudmade.com">CloudMade</a>'
      }).addTo( widget.map );
  // https://raw.github.com/shramov/leaflet-plugins/master/layer/tile/Bing.js
  var tile_bing = new L.BingLayer("ArewtcSllazYp52r7tojb64N94l-OrYWuS1GjUGeTavPmJP_jde3PIdpuYm24VpR");
  
  var couchmap = new L.CouchMap(couchmapoptions);
  var couchlayers = couchmap.getLayers();
  
  widget.map.addLayer(couchlayers['nodes']).addLayer(couchlayers['links']);
  widget.control_layers = L.control.layers(
      {
        "Cloudmade OSM": tile_cloudmade,
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
  return widget;
}

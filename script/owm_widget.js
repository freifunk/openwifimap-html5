var OWMWidget = function (options) {
  var widget = {};
  var options = L.extend({
    divId: 'map',
    getPopupHTML: function () {},
    onBBOXChange: function () {},
    couchmapoptions: {}
  }, options);
  
  widget.map = L.map(options['divId']);
  
  var tile_cloudmade = L.tileLayer('http://{s}.tile.cloudmade.com/{key}/{styleId}/256/{z}/{x}/{y}.png', {
      key: 'e4e152a60cc5414eb81532de3d676261',
      styleId: 997,
      attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery &copy; <a href="http://cloudmade.com">CloudMade</a>'
      }).addTo( widget.map );
  // https://raw.github.com/shramov/leaflet-plugins/master/layer/tile/Bing.js
  var tile_bing = new L.BingLayer("ArewtcSllazYp52r7tojb64N94l-OrYWuS1GjUGeTavPmJP_jde3PIdpuYm24VpR");
  
  var couchmap = new L.CouchMap(options.couchmapoptions);
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

  widget.control_scale = L.control.scale({imperial: false, maxWidth: 150}).addTo(widget.map);
  widget.map.attributionControl.addAttribution('Nodes+Links &copy; <a href="http://openwifimap.net">OpenWiFiMap</a> contributors under <a href="http://opendatacommons.org/licenses/odbl/summary/">ODbL</a>');

  return widget;
}

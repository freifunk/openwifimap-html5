L.CouchMap = function (options) {
  var options = L.extend({
      'couchUrl': '',
      'nodesUrl': '_view/nodes',
      'nodesUrlSpatial': '_spatial/nodes',
      'nodesUrlCoarse': '_view/nodes_coarse',
      'coarseThreshold': 500,   // switch to coarse if this number of nodes
                              // is exceeded
      'coarseGranularity': 2, // 0: very coarse, 1 medium, 2 fine
      // function that adds node to the layer
      'nodeAdd': function(nodedata, layer) {
        return L.marker(nodedata.latlng, {
          title: nodedata.id,
        }).addTo(layer)
      },
      // function that determines if the node should be included
      // (perhaps you cannot filter everything via map-reduce)
      'nodeFilter': function(nodedata) { return true; },
      // called when the count of visible nodes has changed
      'nodeCountUpdate': function (count) {},
      // function that adds link to the layer
      'linkAdd': function(node1, node2, layer) {
         return L.polyline([node1.data.latlng, node2.data.latlng]).addTo(layer);
      },
    }, options);

  var map = null;
  var active = false;
  var requests = []; // all currently running ajax requests

  function requestFail(jqXHR) {
    var i = requests.indexOf(jqXHR);
    console.log('request '+i+' failed, removing from queue');
    requests.splice(i, 1);
  }

  var layers_enabled = {
    'nodes': false,
    'links': false
  };

  var layers = {
    'nodes': new L.CMLayerGroup( setLayer('nodes', true), setLayer('nodes', false) ),
    'links': new L.CMLayerGroup( setLayer('links', true), setLayer('links', false) )
  };

  var layer_nodes_coarse = new L.LayerGroup();
  var layer_nodes_fine = new L.MarkerClusterGroup();
  var layer_links = new L.LayerGroup();

  var nodes = {};
  var links_pending = {};

  this.refresh = function () {
    onBboxChange();
  }

  // called whenever the bounding box of the map changed
  function onBboxChange(e) {
    var bboxstr = map.getBounds().toBBoxString();

    // abort any running ajax requests
    for (var i=0, request; request=requests[i++];) {
      request.abort();
    }
    requests = [];

    // probe number of nodes in new bbox, then decide what to do
    requests.push(
      $.getJSON(options['couchUrl']+options['nodesUrlSpatial'], 
        { "bbox": bboxstr, count: true },
        processBboxCount
      ).fail(requestFail)
    );
  }

  // receives the count in the current bounding box and decides
  // whehter all data should be fetched or only a few more counts
  function processBboxCount(data) {
    if (data.count < options['coarseThreshold']) {
      var bboxstr = map.getBounds().toBBoxString();
      // fetch all data in bbox
      requests.push(
        $.getJSON(options['couchUrl']+options['nodesUrlSpatial'], 
          { "bbox": bboxstr },
          processBboxCountFine
        ).fail(requestFail)
      );
    } else {
      // partition bbox and request counts for each partition
      tiles = getTilesInBbox(map.getBounds(), Math.min(map.getZoom()+options['coarseGranularity'], map.getMaxZoom()));

      // $.post doesn't work (contentType cannot be passed)
      requests.push( $.ajax({
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json',
        data: JSON.stringify({'keys': tiles}),
        url: options['couchUrl']+options['nodesUrlCoarse']+'?group=true',
        success: processBboxCountCoarse
      }).fail(requestFail) );
    }
  }

  // shows nodes/counts based on client-side clustering
  function processBboxCountFine(data) {
    layers['nodes'].clearLayers().addLayer( layer_nodes_fine );
    layers['links'].clearLayers().addLayer( layer_links );
    // loop over nodes and find links
    var missing_links = {};
    var bbox_nodes = [];
    for (var i=0, row; row=data.rows[i++]; ) {
      var nodedata = row.value;
      if (options['nodeFilter'](nodedata)) {
        bbox_nodes.push(nodedata);
        addNode(row.id, nodedata)
        if (!nodes[row.id].links_handled) {
          if (nodedata.links) {
            for (var j=0, link; link=nodedata.links[j++]; ) {
              if (nodes[link.id]) {
                addLink(row.id, link.id)
                if (missing_links[row.id]) {
                  delete missing_links[row.id];
                }
              } else {
                missing_links[link.id] = true;
                if (!links_pending[link.id]) {
                  links_pending[link.id] = {};
                }
                links_pending[link.id][row.id] = true;
              }
            }
            if (links_pending[row.id]) {
              for (var link in links_pending[row.id]) {
                addLink(row.id, link)
              }
              delete links_pending[row.id];
            }
          }
          nodes[row.id].links_handled = true;
        }
      }
    }
    options['nodeCountUpdate'](bbox_nodes.length);

    missing_links = Object.keys(missing_links);
    if (missing_links.length>0) {
      // get the missing nodes for establishing all links
      $.ajax({
        type: 'POST',
        dataType: 'json',
        contentType: "application/json",
        data: JSON.stringify({"keys": missing_links}),
        url: options['couchUrl']+options['nodesUrl'],
        success: function(data){
          for (var i=0, row; row=data.rows[i++]; ) {
            var nodedata = row.value;
            if (options['nodeFilter'](nodedata)) {
              addNode(row.id, nodedata);

              if (links_pending[row.id]) {
                for (var link in links_pending[row.id]) {
                  addLink(row.id, link);
                }
                delete links_pending[row.id];
              }
            }
          }
        }
      });
    }
  }

  function addNode(id, nodedata) {
    if (nodes[id]) {
      return;
    }
    nodes[id] = {
      data: nodedata,
      link_lines: {},
      links_handled: false,
      marker: options['nodeAdd'](nodedata, layer_nodes_fine)
    };
  }

  function addLink(id1, id2) {
    var node1 = nodes[id1], node2 = nodes[id2];

    if (node1.link_lines[id2] && node2.link_lines[id1]) {
      return;
    }

    var line = options['linkAdd'](node1, node2, layer_links);
    node1.link_lines[id2] = line;
    node2.link_lines[id1] = line;
    return line;
  }

  // shows coarse counts based on server-side map/reduce clustering
  function processBboxCountCoarse(data) {
    layers['nodes'].clearLayers().addLayer( layer_nodes_coarse.clearLayers() );
    layers['links'].clearLayers();

    var count=0;
    for (var i=0, item; item=data.rows[i++]; ) {
      // hack in order to pass parameters to click handler
      (function(item) {
        var zoom = item.key[0],
            x = item.key[1],
            y = item.key[2],
            a = tile2LatLng(x, y, zoom),
            b = tile2LatLng(x+1, y+1, zoom);
        // place marker in the middle of the tile
        var size = 'large';
        if (item.value < 10) {
          size = 'small';
        } else if (item.value < 100) {
          size = 'medium';
        }

        var icon = new L.DivIcon({ html: '<div><span>' + item.value + '</span></div>', className: 'marker-cluster marker-cluster-'+size, iconSize: new L.Point(40, 40) });
        count += item.value;

        L.marker( [ (a.lat+b.lat)/2, (a.lng+b.lng)/2], {icon: icon}).addTo(layer_nodes_coarse).on('click', function(e) {
          map.fitBounds([a,b])
        });
      }(item));
    }
    options['nodeCountUpdate'](count);
  }

  function getTilesInBbox(bbox, zoom) {
    var center = bbox.getCenter(),
        x = long2tile(center.lng, zoom),
        y = lat2tile(center.lat, zoom);
    for (var xmin=x;   bbox.contains( [ center.lat, tile2long(xmin, zoom)] ); xmin--){};
    for (var xmax=x+1; bbox.contains( [ center.lat, tile2long(xmax, zoom)] ); xmax++){};
    for (var ymin=y;   bbox.contains( [ tile2lat(ymin, zoom), center.lng ] ); ymin--){};
    for (var ymax=y+1; bbox.contains( [ tile2lat(ymax, zoom), center.lng ] ); ymax++){};

    tiles = [];
    for (var y=ymin; y<ymax; y++) {
      for (var x=xmin; x<xmax; x++) {
        tiles.push([zoom,x,y]);
      }
    }
    return tiles;
  }

  function activate() {
    active = true;
    map.on('moveend', onBboxChange);
    // simulate bounding box change when activated
    onBboxChange();
  }

  function deactivate() {
    active = false;
    map.off('moveend', onBboxChange);
  }

  function updateLayer() {
    var active_new = false;
    for (layername in layers_enabled) {
      if (layers_enabled[layername]) {
        active_new = true;
      }
    }
    if (active && !active_new) {
      deactivate();
    } else if (!active && active_new) {
      activate();
    }
  }

  function setLayer(layername, enable) {
    return function (layermap) {
      layers_enabled[layername] = enable;
      map = layermap;
      updateLayer();
    }
  }

  this.getLayers = function() {
    return layers;
  }

  // *************************************************************************
  // Helper functions
  // *************************************************************************

  // cf. http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
  function long2tile(lon,zoom) {
    return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
  }

  function lat2tile(lat,zoom)  {
    return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
  }

  // returns NW-corner of tile
  function tile2long(x,z) {
    return (x/Math.pow(2,z)*360-180);
  }

  function tile2lat(y,z) {
    var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
    return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
  }

  function tile2LatLng(x,y,z) {
    return new L.LatLng(tile2lat(y,z), tile2long(x,z));
  }
}

// we enhance the onAdd and onRemove functions s.t. they call the provided
// handler onAdded and onRemoved
L.CMLayerGroup = function (onAdded, onRemoved) {
  this.onAdded = onAdded || (function () {});
  this.onRemoved = onRemoved || function () {};
  var args = Array.prototype.slice.call(arguments);
  L.LayerGroup.apply(this, args.slice(2));
}
L.CMLayerGroup.prototype = new L.LayerGroup();
L.CMLayerGroup.prototype.constructor = new L.CMLayerGroup;

L.CMLayerGroup.prototype.onAdd = function (map) {
  var ret = L.LayerGroup.prototype.onAdd.call(this, map);
  this.onAdded(map);
  return ret;
}

L.CMLayerGroup.prototype.onRemove = function (map) {
  var ret = L.LayerGroup.prototype.onRemove.call(this, map);
  this.onRemoved(map);
  return ret;
}

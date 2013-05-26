//////////////////////////////////////////////////////////
// jquery mobile page + parameter handling

// this function is free software, Copyright (c) 2011, Kin Blas
// see https://github.com/jblas/jquery-mobile-plugins/blob/master/page-params/jqm.page.params.js
function queryStringToObject( qstr )
{
  var result = {},
      nvPairs = ( ( qstr || "" ).replace( /^\?/, "" ).split( /&/ ) ),
      i, pair, n, v;

  for ( i = 0; i < nvPairs.length; i++ ) {
    var pstr = nvPairs[ i ];
    if ( pstr ) {
      pair = pstr.split( /=/ );
      n = pair[ 0 ];
      v = pair[ 1 ];
      if ( result[ n ] === undefined ) {
        result[ n ] = v;
      } else {
        if ( typeof result[ n ] !== "object" ) {
          result[ n ] = [ result[ n ] ];
        }
        result[ n ].push( v );
      }
    }
  }

  return result;
}

//////////////////////////////////////////////////////////
// general functions
function getPopupHTML(nodedata) {
  return ich.mappopupmust(nodedata, true);
}

// obj may be an object or a list
function scanListsObj(obj) {
  if (obj instanceof Array) {
    for (var i=0; i<obj.length; i++) {
      scanListsObj(obj[i]);
    }
    return obj.length>0
  }
  if (obj instanceof Object) {
    for (var key in obj) {
      var val = obj[key];
      if (scanListsObj(val)) {
        obj[String(key)+"?"] = true;
      }
    }
    return false;
  }
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

function latlng2lnglat(latlng) {
  return [latlng[1], latlng[0]];
}

function validateNode(nodedata) {
  // ignore this node if mtime older than 7 days
  var date = new Date();
  date.setHours(date.getHours() - 24*7);
  var nodedate = new Date(nodedata['mtime']);
  return nodedate > date;
}

(function() {
  var couchurl = 'http://couch.pberg.freifunk.net/openwifimap_dev/_design/owm-api/';

  //////////////////////////////////////////////////////////
  // map page
  $(document).on('pageshow', '#map', function() {
    var mappage = $('#map');
    var bbox=null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }
    
    function onBboxChange(bboxstr) {
      var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
      if (currentPageID=='map') {
        params.sethash( '#map?bbox=' + bboxstr );
        $("a#listlink").attr('href', '#list?bbox=' + bboxstr);
      }
    }

    var owmwidget = mappage.data('owmwidget');
    if (!owmwidget) {
      owmwidget = new OWMWidget(
          { 
            divId: 'mapdiv',
            onBboxChange: function(bbox) {
              onBboxChange(bbox.toString());
            }
          },
          {
            trackResize: false
          },
          { 
            couchUrl: couchurl, coarseThreshold: 100,
            nodeFilter: validateNode
          }
        );
      mappage.data('owmwidget', owmwidget);

      function onResize() {
        var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
        if (currentPageID=='map') {
          // This hack is needed as long as 100% height in css is f**ked up.
          // The height is not set to 100% at this point but so something else,
          // so zooming is screwed up without the hack.
          var cur_height = $('#mapdiv').height();
          var new_height =
              $(window).height()
              - $('#map div[data-role="header"]').height()
              - $('#map div[data-role="footer"]').height();
          $('#mapdiv').height( new_height );
          owmwidget.map.invalidateSize();
        }
      }
      $(window).on("pageshow resize", onResize);
      onResize();

      if (!bbox) {
        owmwidget.map.locate({setView: true, maxZoom: 15});
      }
    }

    if (bbox) {
      // nasty hack: shrink the bbox a bit, so we don't zoom out
      var h = bbox[1][0] - bbox[0][0];
      var w = bbox[1][1] - bbox[0][1];
      var eps = 0.05;
      bbox[0][0] += eps*h;
      bbox[0][1] += eps*w;
      bbox[1][0] -= eps*h;
      bbox[1][1] -= eps*w;

      owmwidget.map.fitBounds(bbox);
    }
  });


  //////////////////////////////////////////////////////////
  // list page
  function listUpdate(data) {
    $("#listdiv").empty().append( ich.listmust(data) );
    var listul = $("#listul");
    if (listul.hasClass('ui-listview')) {
      listul.listview('refresh');
    } else {
      listul.listview();
    }
  }

  $(document).on('pagebeforeshow', '#list', function (){
    var bbox = null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }
    if (bbox) {
      $("a#maplink").attr("href", "#map?bbox=" + bbox.toString());
      var bboxlnglat = [latlng2lnglat(bbox[0]), latlng2lnglat(bbox[1])].toString();
      $.getJSON(couchurl + '_spatial/nodes', { "bbox": bboxlnglat  }, function(data) {
        var nodes = [];
        for (var i=0; i<data.rows.length; i++) {
          var node = data.rows[i].value;
          if (validateNode(node)) {
            nodes.push(node);
          }
        }
        listUpdate({bbox: bbox.toString(), nodes: nodes});
      });
    } else {
      $("#listdiv").empty().append("<p>No area selected! Go to the <a href=\"#map\">map</a> to select an area.</p>");
    }
  });


  //////////////////////////////////////////////////////////
  // detail page

  function detailmapResize() {
    var currentPageID = $.mobile.activePage == null ? 'map' : $.mobile.activePage.attr('id');
    if (currentPageID=='detail') {
      var map = $("#detailmap");
      width = ( $(document).width() < 500 ) ? '100%' : '50%';
      $('#detailmapcontainer').css('width', width);
      $('#detailaddrcontainer').css('width', width);
      map.height( map.width()*0.8 );
      var detailpagemap = $('#detail').data('map');
      if (detailpagemap) {
        detailpagemap.map.invalidateSize();
      }
    }
  }

  $(window).on("pageshow resize", detailmapResize);

  $(document).on('pagebeforeshow', '#detail', function () {
    var detailpage = $('#detail');

    var bbox = null;
    var pd = $.mobile.pageData;
    if (pd && pd.bbox && typeof pd.bbox == "string") {
      bbox = getBboxFromString(pd.bbox);
    }
    if (bbox) {
      $("a#detailback").attr("href", "#list?bbox=" + bbox.toString() );
      $("a#detailback .ui-btn-text").text("List");
    } else {
      $("a#detailback").attr("href", "#map" );
      $("a#detailback .ui-btn-text").text("Map");
    }

    node = null;
    if (pd && pd.node && (typeof pd.node == "string")) {
      node = pd.node;
    }
    if (node) {
      $.getJSON(couchurl + '../../' + node, {}, function(data) {
        var mapdiv = null;
        var detailpagemap = detailpage.data('map');
        if (detailpagemap) {
          mapdiv = $("#detailmap").detach();
        }
        // i can haz detailed data?
        scanListsObj(data);
        data.couchurl = couchurl + '../..';
        $("#detaildiv").empty().append( ich.detailmust(data) ).trigger('create');

        // i can haz avatar?
        var avatarurl = null;
        if (data._attachments) {
          Object.keys(data._attachments).forEach( function(key) {
            // limit avatars to 150kB
            if ( (/^avatar\.(png|jpg)$/).test(key) && data._attachments[key].length<150000) {
              avatarurl = "/openwifimap/" + data._id + "/" + key;
            }
          });
        }
        if (avatarurl) {
          $("#avaframe").empty().append( '<img id="avatar" src="' + avatarurl + '" />' );
        }

        if (!detailpagemap) {
          detailpagemap = new OWMWidget(
              {
                divId: 'detailmap',
                onBboxChange: function(bboxstr) {}
              },
              {
                trackResize: false
              },
              { 
                couchUrl: couchurl, coarseThreshold: 100,
                nodeFilter: validateNode
              }
            );
          detailpage.data('map', detailpagemap);
          //'detailmap', getPopupHTML);
        } else {
          $("#detailmapcontainer").empty().append(mapdiv);
        }
        detailmapResize();
        detailpagemap.map.setView([data.latitude,data.longitude], 16);
        $("#detailmapcenter").click( function () {
          detailpagemap.map.setView([data.latitude,data.longitude], 16);
        });
      });
    } else {
      $("#detaildiv").empty().append("<p>No node selected! Go to the <a href=\"#map\">map</a> to select an area.</p>");
    }
  });
})();

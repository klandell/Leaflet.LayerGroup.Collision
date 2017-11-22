import { LayerGroup, layerGroup } from 'leaflet';
import rbush from 'rbush';

// create references to the base class' methods
const {
  initialize,
  onAdd,
  onRemove,
  addLayer,
  removeLayer,
  clearLayers,
} = LayerGroup.prototype;

// create an array of options supported by this plugin
const allowedOptions = ['margin'];

/**
 * debugger, idk [collisionPlugin description]
 * @type {Object}
 */
const collisionPlugin = {
  initialize(options) {
    initialize.call(this, options);
    // initialize necessary instance properties
    this.tree = rbush();
    this.layerMap = new Map();
    // populate the allowed options
    Object.keys(options).forEach(k => {
      if (allowedOptions.includes(k)) {
        this.options[k] = options[k];
      }
    });
  },

  onAdd(map) {
    onAdd.call(this, map);
    // add a zoomend listener, we need to re-detect collisions
    // after the map has been zoomed in or out
    map.on('zoomend', this.onZoomEnd, this);
  },

  onRemove(map) {
    onRemove.call(this, map);
    // cleaup the zoomend listener
    map.off('zoomend', this.onZoomEnd, this);
  },

  addLayer(layer) {
    addLayer.call(this, layer);

    if (layer.getTooltip()) {
      // if this layer has a tooltip, we need to check to see if
      // the tooltip collides with any other, and remove it if
      // necessary
      this.detectCollision(layer);
      // add the layer to a Map so that we can keep track of
      // the possible layers even if there was a collision and
      // they aren't currently visible on the map
      this.layerMap.set(layer, null);
    }
  },

  removeLayer(layer) {
    const layerMap = this.layerMap;
    // remove the layer from the r-tree, since the layer is
    // no longer part of this layergroup, it should not
    // cause any collisions
    this.tree.remove(layerMap.get(layer))
    // remove the layer from the layerMap, since it has been
    // removed, we don't need to worry about keeping track
    // of it anymore
    layerMap.delete(layer);
    // finally, remove the layer from the map
    removeLayer.call(this, layer);
  },

  clearLayers() {
    clearLayers.call(this);
    // clean up the r-tree
    this.tree.clear();
  },

  onZoomEnd() {
    // clear the tree, all of the layers will have new positions
    // so it makes sense just to remove all items and re-index
    this.tree.clear();

    // loop through all possible layers and detect collisions
    this.layerMap.forEach((v, k) => this.detectCollision(k));
  },

  detectCollision(layer) {
    const el = layer.getTooltip().getElement().childNodes[0];

    // break out if there is no child el for the tooltip.
    if (!el) {
      return;
    }

    // calculate the clientBoundingRect for the element
    const { left, bottom, right, top } = el.getBoundingClientRect();

    // convert the bounding client rect to an rbush bounding box
    const bbox = {
      minX: left,
      minY: top,
      maxX: right,
      maxY: bottom,
    };

    // link the bounding box to its layer
    this.layerMap.set(layer, bbox);

    // check to see if this layer collides with any others
    const collision = this.tree.collides(bbox);

    if (collision) {
      // if there was a collision, remove the layer from
      // the map. Use the prototype version of the remove
      // layer function here because we don't want to go
      // through the additional logic of removing the layer
      // from the r-tree and layerMap
      removeLayer.call(this, layer);
    } else {
      // index the bounding box
      this.tree.insert(bbox);
    }
  },
};

// add the plugin to the leaflet layergroup
LayerGroup.Collision = LayerGroup.extend(collisionPlugin);
layerGroup.collision = (options = {}) => {
  return new LayerGroup.Collision(options);
};


/*
import rbush from 'rbush';

var isMSIE8 = !('getComputedStyle' in window && typeof window.getComputedStyle === 'function')

function extensions(parentClass) { return {

	initialize: function (options) {
		parentClass.prototype.initialize.call(this, options);
		this._originalLayers = [];
		this._visibleLayers = [];
		this._staticLayers = [];
		this._rbush = [];
		this._cachedRelativeBoxes = [];
		this._margin = options.margin || 0;
		this._rbush = null;
	},

	addLayer: function(layer) {
		if (layer._tooltip && layer._tooltip._container) {
            this._originalLayers.push(layer);
            if (this._map) {
                this._maybeAddLayerToRBush( layer );
            }
        } else {
            this._staticLayers.push(layer);
			parentClass.prototype.addLayer.call(this, layer);
        }
	},

	removeLayer: function(layer) {
		this._rbush.remove(this._cachedRelativeBoxes[layer._leaflet_id]);
		delete this._cachedRelativeBoxes[layer._leaflet_id];
		parentClass.prototype.removeLayer.call(this,layer);
		var i;

		i = this._originalLayers.indexOf(layer);
		if (i !== -1) { this._originalLayers.splice(i,1); }

		i = this._visibleLayers.indexOf(layer);
		if (i !== -1) { this._visibleLayers.splice(i,1); }

		i = this._staticLayers.indexOf(layer);
		if (i !== -1) { this._staticLayers.splice(i,1); }
	},

	clearLayers: function() {
		this._rbush = rbush();
		this._originalLayers = [];
		this._visibleLayers  = [];
		this._staticLayers   = [];
		this._cachedRelativeBoxes = [];
		parentClass.prototype.clearLayers.call(this);
	},

	onAdd: function (map) {
		this._map = map;

		for (var i in this._staticLayers) {
			map.addLayer(this._staticLayers[i]);
		}

		this._onZoomEnd();
		map.on('zoomend', this._onZoomEnd, this);
	},

	onRemove: function(map) {
		for (var i in this._staticLayers) {
			map.removeLayer(this._staticLayers[i]);
		}
		map.off('zoomend', this._onZoomEnd, this);
		parentClass.prototype.onRemove.call(this, map);
	},

	_maybeAddLayerToRBush: function(layer) {

		var z    = this._map.getZoom();
		var bush = this._rbush;

		var boxes = this._cachedRelativeBoxes[layer._leaflet_id];
		var visible = false;
		if (!boxes) {
			// Add the layer to the map so it's instantiated on the DOM,
			//   in order to fetch its position and size.
			parentClass.prototype.addLayer.call(this, layer);
			var visible = true;

			var box = this._getTooltipBox(layer._tooltip._container);
			boxes = this._getRelativeBoxes(layer._tooltip._container.children, box);
			boxes.push(box);
			this._cachedRelativeBoxes[layer._leaflet_id] = boxes;
		}

		boxes = this._positionBoxes(this._map.latLngToLayerPoint(layer.getLatLng()),boxes);

		var collision = false;
		for (var i=0; i<boxes.length && !collision; i++) {
			collision = bush.search(boxes[i]).length > 0;
		}

		if (!collision) {
			if (!visible) {
				parentClass.prototype.addLayer.call(this, layer);
			}
			this._visibleLayers.push(layer);
			bush.load(boxes);
		} else {
			parentClass.prototype.removeLayer.call(this, layer);
		}
	},


	// Returns a plain array with the relative dimensions of an L.tooltip
	_getTooltipBox: function (el) {

		if (isMSIE8) {
			// Fallback for MSIE8, will most probably fail on edge cases
			return [ 0, 0, el.offsetWidth, el.offsetHeight];
		}

		var styles = window.getComputedStyle(el);

		// getComputedStyle() should return values already in pixels, so using parseInt()
		//   is not as much as a hack as it seems to be.

		return [
			parseInt(styles.marginLeft),
			parseInt(styles.marginTop),
			parseInt(styles.marginLeft) + parseInt(styles.width),
			parseInt(styles.marginTop)  + parseInt(styles.height)
		];
	},


	// Much like _getTooltipBox, but works for positioned HTML elements, based on offsetWidth/offsetHeight.
	_getRelativeBoxes: function(els,baseBox) {
		var boxes = [];
		for (var i=0; i<els.length; i++) {
			var el = els[i];
			var box = [
				el.offsetLeft,
				el.offsetTop,
				el.offsetLeft + el.offsetWidth,
				el.offsetTop  + el.offsetHeight
			];
			box = this._offsetBoxes(box, baseBox);
			boxes.push( box );

			if (el.children.length) {
				var parentBox = baseBox;
				if (!isMSIE8) {
					var positionStyle = window.getComputedStyle(el).position;
					if (positionStyle === 'absolute' || positionStyle === 'relative') {
						parentBox = box;
					}
				}
				boxes = boxes.concat( this._getRelativeBoxes(el.children, parentBox) );
			}
		}
		return boxes;
	},

	_offsetBoxes: function(a,b){
		return [
			a[0] + b[0],
			a[1] + b[1],
			a[2] + b[0],
			a[3] + b[1]
		];
	},

	// Adds the coordinate of the layer (in pixels / map canvas units) to each box coordinate.
	_positionBoxes: function(offset, boxes) {
		var newBoxes = [];	// Must be careful to not overwrite references to the original ones.
		for (var i=0; i<boxes.length; i++) {
			newBoxes.push( this._positionBox( offset, boxes[i] ) );
		}
		return newBoxes;
	},

	_positionBox: function(offset, box) {
		return {
			minX: box[0] + offset.x - this._margin,
			minY: box[1] + offset.y - this._margin,
			maxX: box[2] + offset.x + this._margin,
			maxY: box[3] + offset.y + this._margin,
		};
	},

	_onZoomEnd: function() {

		for (var i=0; i<this._visibleLayers.length; i++) {
			parentClass.prototype.removeLayer.call(this, this._visibleLayers[i]);
		}

		this._rbush = rbush();

		for (var i=0; i < this._originalLayers.length; i++) {
			this._maybeAddLayerToRBush(this._originalLayers[i]);
		}

	}
}};


L.LayerGroup.Collision   = L.LayerGroup.extend(extensions( L.LayerGroup ));
L.FeatureGroup.Collision = L.FeatureGroup.extend(extensions( L.FeatureGroup ));
L.GeoJSON.Collision      = L.GeoJSON.extend(extensions( L.GeoJSON ));

// Uppercase factories only for backwards compatibility:
L.LayerGroup.collision = function (options) {
	return new L.LayerGroup.Collision(options || {});
};

L.FeatureGroup.collision = function (options) {
	return new L.FeatureGroup.Collision(options || {});
};

L.GeoJSON.collision = function (options) {
	return new L.GeoJSON.Collision(options || {});
};

// Factories should always be lowercase, like this:
L.layerGroup.collision = function (options) {
	return new L.LayerGroup.Collision(options || {});
};

L.featureGroup.collision = function (options) {
	return new L.FeatureGroup.Collision(options || {});
};

L.geoJson.collision = function (options) {
	return new L.GeoJSON.Collision(options || {});
};
*/

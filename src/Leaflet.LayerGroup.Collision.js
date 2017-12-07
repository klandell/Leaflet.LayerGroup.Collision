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
 * LayerGroup collision plugin. Hides layers which have
 * tooltips that overlap other tooltips.
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

    // give the browser some time to render first,
    // flashes sometimes, not an ideal solution
    window.setTimeout(() => {
      this.onZoomEnd();
    }, 0);

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
    this.layerMap.forEach((v, k) => {
      // if the layer isn't on the map, add it now.
      if (!k.getElement()) {
        addLayer.call(this, k);
      }
      this.detectCollision(k)
    });
  },

  detectCollision(layer) {
    let el = layer.getTooltip().getElement().childNodes[0];

    // break out if there is no child el for the tooltip.
    if (!el) {
      return;
    }

    // calculate the clientBoundingRect for the element
    const { left, bottom, right, top } = el.getBoundingClientRect();

    // convert the bounding client rect to an rbush bounding box
    const { margin } = this.options;
    const bbox = {
      minX: left - margin,
      minY: top - margin,
      maxX: right + margin,
      maxY: bottom + margin,
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

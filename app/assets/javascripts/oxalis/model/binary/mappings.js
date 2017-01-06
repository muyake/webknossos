import _ from "lodash";
import Request from "libs/request";
import ErrorHandling from "libs/error_handling";

class Mappings {


  constructor(datasetName, layer) {

    this.mappings = _.keyBy(layer.mappings, "name");
    this.baseUrl = `/data/datasets/${datasetName}/layers/${layer.name}/mappings/`;
    this.doWithToken = layer.doWithToken.bind(layer);
  }


  getMappingNames() {

    return _.keys(this.mappings);
  }


  getMappingArrayAsync(mappingName) {

    return this.fetchMappings(mappingName).then( () => {
      return this.getMappingArray(mappingName);
    }
    );
  }


  fetchMappings(mappingName) {

    const mappingChain = this.getMappingChain(mappingName);
    const promises = _.map(mappingChain, mappingName => this.fetchMapping(mappingName));
    return Promise.all(promises);
  }


  fetchMapping(mappingName) {

    if (this.mappings[mappingName].mappingObject != null) {
      return Promise.resolve();
    }

    return this.doWithToken( token => {
      return Request.receiveJSON(
        this.baseUrl + mappingName + `?token=${token}`
      ).then(
        mapping => {
          this.mappings[mappingName].mappingObject = mapping;
          return console.log("Done downloading:", mappingName);
        },
        error => console.error("Error downloading:", mappingName, error));
    }
    );
  }


  getMappingArray(mappingName) {

    const mapping = this.mappings[mappingName];
    if (mapping.mappingArray != null) {
      return mapping.mappingArray;
    }

    return mapping.mappingArray = this.buildMappingArray(mappingName);
  }


  buildMappingArray(mappingName) {

    const mappingArray = [];

    for (let currentMappingName of this.getMappingChain(mappingName)) {

      const { mappingObject } = this.mappings[currentMappingName];
      ErrorHandling.assert(mappingObject,
          "mappingObject must have been fetched at this point");

      for (let mappingClass of mappingObject.classes) {

        const minId = this.min(mappingClass);
        const mappedId = mappingArray[minId] || minId;

        for (let id of mappingClass) {
          mappingArray[id] = mappedId;
        }
      }
    }

    return mappingArray;
  }


  getMappingChain(mappingName) {

    const chain = [mappingName];
    let mapping = this.mappings[mappingName];

    while (mapping.parent != null) {
      chain.push(mapping.parent);
      mapping = this.mappings[mapping.parent];
    }

    return chain;
  }


  // Since Math.min(array...) does not scale
  min(array) {

    let min = Infinity;
    for (let entry of array) {
      min = Math.min(min, entry);
    }
    return min;
  }
}

export default Mappings;
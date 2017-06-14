import { BufferGeometryAnalyzer } from '../src/analyzers/BufferGeometryAnalyzer';
import { STLLoader } from '../src/loaders/STLLoader';
import * as THREE from 'three';
import * as FS from 'fs';
import { expect } from 'chai';

describe("IsloatedGeometries tests", function() {
    it("compare stl with adjacent boxes", function (done) {
        FS.readFile("./adjacent_boxes.stl", 'utf8', function (err, data) {
            expect(err).to.be.null;
            let g = new STLLoader().parse(data);
            let isolated = BufferGeometryAnalyzer.isolatedGeometries(g);
            expect(isolated).to.have.lengthOf(2);
            done();
        });
    });
});

describe("octree testing", function() {
    it("octree", function (done) {
        let octree = new THREE.Octree({});
        octree.add({x:0, y:0, z:0, radius: 1, id: "hi"});
        //console.log(octree);
        console.log(octree.search({x:0, y:0, z:0}, 1));
        octree.update();
        console.log(octree.search({x:0, y:0}, 1));
        done();
    });
});
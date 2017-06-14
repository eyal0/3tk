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

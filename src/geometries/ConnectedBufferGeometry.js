import * as THREE from 'three';

// A ConnectedBufferGeometry is similar to a BufferGeometry with
// additional neighbor information.  The neighbor information
// maintains which face is connected to which face by which edge.
class ConnectedBufferGeometry {
    constructor() {
        // An array of numbers.  Every triple represents a point.
        // Every 3 points is a face.
        this.positions = [];
        // neighbors has length the same as faces*3.  Each element is
        // the position of the neighboring faceEdge.
        this.neighbors = [];
        // A list as long as the number of faces.  Each element is a
        // number that identifies an island.  All faces that have the
        // same island number are part of the same shape.  faces that
        // have null island are degenerate and not part of any shape.
        this.reverseIslands = [];
    }

    clone() {
        let newCBG = new ConnectedBufferGeometry();
        newCBG.positions = this.positions.slice(0);
        newCBG.neighbors = this.neighbors.slice(0);
        newCBG.reverseIslands = this.reverseIslands.slice(0);
        return newCBG;
    }

    fromBufferGeometry(bufferGeometry) {
        this.positions = Array.from(bufferGeometry.getAttribute('position').array);
        if (!this.findNeighbors()) {
            return null;
        }
        this.deleteDegenerates();
        return this;
    }

    keyForTrio(startIndex, precisionPoints = -1) {
        let array = this.positions;
        let [v1, v2, v3] = [array[startIndex], array[startIndex+1], array[startIndex+2]];
        if (precisionPoints >= 0) {
            var precision = Math.pow( 10, precisionPoints );
            return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );
        } else {
            return v1 + '_' + v2 + '_' + v3;
        }
    }

    keyForVector3(vector3, precisionPoints = -1) {
        let [v1, v2, v3] = [vector3.x, vector3.y, vector3.z];
        if (precisionPoints >= 0) {
            var precision = Math.pow( 10, precisionPoints );
            return Math.round( v1 * precision ) + '_' + Math.round( v2 * precision ) + '_' + Math.round( v3 * precision );
        } else {
            return v1 + '_' + v2 + '_' + v3;
        }
    }

    vertexPositionMap(precisionPoints = -1) {
        let map = new Map();
        for (var posIndex = 0; posIndex < this.positions.length; posIndex += 3) {
            let key = this.keyForTrio(posIndex, precisionPoints);
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key).push(posIndex);
        }
        return map;
    }

    // Given a faceIndex (0 to faceCount-1), return position in originalPositions.
    positionFromFace(faceIndex) {
        return faceIndex*9;
    }

    // Given an index in originalPositions, return the face (0 to facecount-1).
    faceFromPosition(positionIndex) {
        return Math.floor(positionIndex/9);
    }
    // Given an index in originalPositions, return the edge (0 to 2).
    edgeFromPosition(positionIndex) {
        return (positionIndex % 9) / 3;
    }
    // Given a faceIndex (0 to faceCount-1) and edgeIndex (0 to 2), return position in originalPositions.
    positionFromFaceEdge(faceIndex, edgeIndex) {
        return this.positionFromFace(faceIndex) + 3*edgeIndex;
    }
    // Given index in originalPositions, return a Vector3 of that point.
    vector3FromPosition(position, positions) {
        return new THREE.Vector3().fromArray(positions, position);
    }

    // Gets the position of an adjacent vertex in the face.  If direction is +3, go forward.  If -3, go to previous.
    otherPositionInFace(posIndex, direction) {
        let faceDifference = this.faceFromPosition(posIndex + direction) - this.faceFromPosition(posIndex);
        return posIndex + direction - this.positionFromFace(faceDifference);
    }
    // Gets the next position in the face, which is the next point
    // unless we're at the end and then it's the first point.
    nextPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, 3);
    }
    // Gets the previous position in the face, which is the
    // previous point unless we're at the start and then it's the
    // last point.
    previousPositionInFace(posIndex) {
        return this.otherPositionInFace(posIndex, -3);
    }

    // Returns true if the x,y,z coordinates at pos1 match those at
    // pos2.
    equalTrios(pos1, pos2) {
        return (this.positions[pos1  ] == this.positions[pos2  ] &&
                this.positions[pos1+1] == this.positions[pos2+1] &&
                this.positions[pos1+2] == this.positions[pos2+2]);
    }

    // Returns true if the faceIndex (0 to faceCount-1) has two
    // identical points in it.
    isFaceDegenerate(faceIndex) {
        let facePoints = new Set();
        for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
            let currentPos = this.positionFromFaceEdge(faceIndex, edgeIndex);
            let nextPos = this.nextPositionInFace(currentPos);
            if (this.positions[currentPos  ] == this.positions[nextPos  ] &&
                this.positions[currentPos+1] == this.positions[nextPos+1] &&
                this.positions[currentPos+2] == this.positions[nextPos+2]) {
                return true;
            }
        }
        return false;
    }

    // Recalculate the neighbors.
    // this.neighbors will be an array with length 3 times the number of faces.
    // Each element is the connection between
    findNeighbors() {
        var vertexPosMap = this.vertexPositionMap();
        const faceCount = this.positions.length / 9;

        // Find the island to which this face belongs using the
        // union-join algorithm.
        let findIsland = function (faceIndex) {
            if (faces[faceIndex].island != null && faces[faceIndex].island != faceIndex) {
                faces[faceIndex].island = findIsland(faces[faceIndex].island)
            }
            return faces[faceIndex].island;
        }
        // Join the islands to which face1 and face2 belong.  Returns
        // the new joined root, for convenience.
        let joinIslands = function (face1, face2) {
            // Union join needed?
            let root1 = findIsland(face1);
            let root2 = findIsland(face2);
            let newRoot = root1;
            if (root1 != root2) {
                // Yes, need to join.
                if (faces[root1].rank < faces[root2].rank) {
                    faces[root1].island = root2;
                    newRoot = root2;
                } else if (faces[root2].rank < faces[root1].rank) {
                    faces[root2].island = root1;
                    newRoot = root1;
                } else {
                    faces[root2].island = root1;
                    faces[root1].rank++;
                    newRoot = root1;
                }
            }
            return newRoot;
        }

        let faces = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let degenerate = this.isFaceDegenerate(faceIndex);
            faces[faceIndex] = {
                // possibleNeighbors is an array of length 3, one for each edge.
                // edge 0 is from point a to b, edge 1 is from b to c, edge 2 is from c to a
                // each element is a map of position indices to angles that could be neighbors for this face.
                // The angle is only computed if needed, otherwise it's null.
                'possibleNeighbors': [new Map(), new Map(), new Map()],
                // These are selected neighbors, null until they are found.
                'neighbors': [null, null, null],
                // Are all three vertices unique?
                'degenerate': degenerate,
                // At first, each face is an island by itself.  Later, we'll join faces.
                'island': degenerate ? null : faceIndex,
                // The below elements are only valid if faces[faceIndex].island = faceIndex;
                // The rank for the union-join algorithm on islands.
                'rank': degenerate ? null : 0
            };
        }

        // Edges that aren't yet in a face-to-face connection.
        let unconnectedEdges = new Set();
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            if (faces[faceIndex].degenerate) {
                continue;
            }
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let posIndex = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let key = this.keyForTrio(posIndex);
                let nextPosition = this.nextPositionInFace(posIndex);
                for (let newPosIndex of vertexPosMap.get(key)) {
                    if (!this.equalTrios(newPosIndex, posIndex)) {
                        continue;
                    }
                    // A face is only neighboring if the edges are in
                    // common and point in opposite directions.
                    let newPreviousPosition = this.previousPositionInFace(newPosIndex);
                    if (!this.equalTrios(nextPosition, newPreviousPosition)) {
                        continue;
                    }
                    // This neighboring face is connected.
                    // We'll ignore degenerate triangles.
                    if (faces[this.faceFromPosition(newPosIndex)].degenerate) {
                        continue;
                    }
                    // We're able to connect to the edge key and
                    // previous, which is the previous edge.
                    faces[faceIndex].possibleNeighbors[edgeIndex].set(newPreviousPosition, null);
                }
                unconnectedEdges.add(posIndex);
            }
        }

        // Returns the angle between faces 0 to 2pi.
        // A smaller angle indicates less enclosed space.
        // Assumes that the common edge is posIndex1 to posIndex1+3 and
        // posIndex2 to posIndex2-3.
        let facesAngle = (posIndex1, posIndex2) => {
            let normal1 = this.faceNormal(this.faceFromPosition(posIndex1));
            let normal2 = this.faceNormal(this.faceFromPosition(posIndex2));
            let commonPoint1 = this.vector3FromPosition(posIndex1, this.positions);
            let commonPoint2 = this.vector3FromPosition(this.nextPositionInFace(posIndex1), this.positions);
            let edge1 = commonPoint2.clone().sub(commonPoint1);
            let normalsAngle = normal1.angleTo(normal2); // Between 0 and pi.
            let facesAngle = Math.PI;
            if (normal1.clone().cross(normal2).dot(edge1) > 0) {
                facesAngle -= normalsAngle;
            } else {
                facesAngle += normalsAngle;
            }
            return facesAngle;
        }

        // Set the face-edge at posIndex2 to be the neighbor of the
        // face-edge at posIndex1.  This function should also be run
        // with arguments swapped to make the connection symmetric.
        let setNeighbor = (posIndex1, posIndex2) => {
            let face1 = this.faceFromPosition(posIndex1);
            let edge1 = this.edgeFromPosition(posIndex1);
            // Remove posIndex1 as possible neighbor for all its neighbors.
            for (let possibleNeighbor of faces[face1].possibleNeighbors[edge1].keys()) {
                let possibleNeighborFace = this.faceFromPosition(possibleNeighbor);
                let possibleNeighborEdge = this.edgeFromPosition(possibleNeighbor);
                faces[possibleNeighborFace].possibleNeighbors[possibleNeighborEdge].delete(posIndex1);
            }
            // Remove all neighbors of posIndex1
            faces[face1].possibleNeighbors[edge1].clear();
            // Set actual neighbor.
            faces[face1].neighbors[edge1] = posIndex2;
        }
        // Connect the face-edges as posIndex1 and posIndex2.  This
        // also updates the unconnectedEdges Set.
        let connectEdge = (posIndex1, posIndex2) => {
            setNeighbor(posIndex1, posIndex2);
            setNeighbor(posIndex2, posIndex1);

            let islandIndex = joinIslands(this.faceFromPosition(posIndex1), this.faceFromPosition(posIndex2));
            // Finally, remove from the set of edges that still need to be resolved.
            unconnectedEdges.delete(posIndex1);
            unconnectedEdges.delete(posIndex2);
        }

        while (unconnectedEdges.size > 0) {
            let foundOne = false;
            // Connect all edges that have just one neighbor.
            for (let posIndex of unconnectedEdges) {
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                if (faces[faceIndex].neighbors[edgeIndex] == null &&
                    faces[faceIndex].possibleNeighbors[edgeIndex].size == 1) {
                    connectEdge(this.positionFromFaceEdge(faceIndex, edgeIndex),
                                faces[faceIndex].possibleNeighbors[edgeIndex].keys().next().value);
                    foundOne = true;
                }
            }
            if (foundOne) {
                continue;
            }
            // Try to join edges that are already part of the same
            // shape.  This makes for shapes that are smaller and
            // better split.
            for (let posIndex of unconnectedEdges) {
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                if (faces[faceIndex].neighbors[edgeIndex] == null) {
                    let currentIsland = findIsland(faceIndex);
                    for (let possibleNeighbor of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                        if (findIsland(this.faceFromPosition(possibleNeighbor)) ==
                            currentIsland) {
                            connectEdge(this.positionFromFaceEdge(faceIndex, edgeIndex),
                                        possibleNeighbor);
                            foundOne = true;
                        }
                    }
                }
            }

            if (foundOne) {
                continue;
            }
            // By here, each possibleNeighbor list has >1 or <1
            // elements.  Get rid of the worst possibleNeighbor.  The
            // worst possibleNeighbor is a sliver.  A sliver is
            // two faces with a separation very close to 0 or 2 pi,
            // ie, far from pi.  We don't expect those to be in a
            // properly built shape so they are usually an indication
            // of two shapes sharing a face.
            let worstPos;
            let worstOtherPos;
            let worstAngle = null;
            for (let posIndex of unconnectedEdges) {
                let faceIndex = this.faceFromPosition(posIndex);
                let edgeIndex = this.edgeFromPosition(posIndex);
                for (let otherPosIndex of faces[faceIndex].possibleNeighbors[edgeIndex].keys()) {
                    let angle = faces[faceIndex].possibleNeighbors[edgeIndex].get(otherPosIndex);
                    if (angle === null) {
                        // Compute the angle between this face and the connected face.
                        angle = facesAngle(posIndex, this.nextPositionInFace(otherPosIndex));
                        faces[faceIndex].possibleNeighbors[edgeIndex].set(otherPosIndex, angle);
                    }
                    const EPSILON = 0.001;
                    let differenceFrom180 = Math.abs(Math.PI-angle);
                    let worstDifferenceFrom180 = Math.abs(Math.PI-worstAngle);
                    // The worst angle is anything too close to 0 or
                    // 2PI.  After that, remove the largest one.
                    if (worstAngle === null ||
                        worstDifferenceFrom180 > Math.PI-EPSILON && differenceFrom180 >= worstDifferenceFrom180 ||
                        !(worstDifferenceFrom180 > Math.PI-EPSILON) && angle > worstAngle) {
                        worstAngle = angle;
                        worstPos = posIndex;
                        worstOtherPos = otherPosIndex;
                    }
                }
            }
            if (worstAngle != null) { // This had better be true!
                // Remove the possible neighbor in both directions.
                faces[this.faceFromPosition(worstPos)].possibleNeighbors[this.edgeFromPosition(worstPos)].delete(worstOtherPos);
                faces[this.faceFromPosition(worstOtherPos)].possibleNeighbors[this.edgeFromPosition(worstOtherPos)].delete(worstPos);
                foundOne = true;
            } else {
                // Couldn't find all neighbors.  Maybe the shape is non-manifold?
                return false;
            }
        }

        // All done, now save the result.
        this.neighbors = [];
        // For each face, store to which island it belongs.  This is a
        // map from the island index (which is the root of the
        // union-find algorithm) to a list of faces.  Degenerate faces
        // are not included in any island.
        this.reverseIslands = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            let islandIndex = findIsland(faceIndex);
            if (Number.isInteger(islandIndex)) {
                this.reverseIslands[faceIndex] = islandIndex;
            }
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let neighbor = faces[faceIndex].neighbors[edgeIndex];
                this.neighbors[faceIndex*3 + edgeIndex] = neighbor === null ? null : neighbor / 3;
            }
        }
        return true;
    }

    // Returns a list of isolated BufferGeometries.
    isolatedBufferGeometries() {
        let geometries = [];
        let islands = new Map();
        let rounded = this.clone();
        rounded.roundVerticesToFloat();
        for (let face = 0; face < rounded.reverseIslands.length; face++) {
            let root = rounded.reverseIslands[face];
            if (!Number.isInteger(root)) {
                continue;
            }
            if (!islands.has(root)) {
                islands.set(root, []);
            }
            islands.get(root).push(face);
        }
        for (let island of islands.values()) {
            let newGeometry = new THREE.BufferGeometry();

            let vertices = [];
            let normals = [];

            for (let faceIndex of island) {
                let posIndex = rounded.positionFromFace(faceIndex);
                for (var i = 0; i < 9; i++) {
                    vertices.push(rounded.positions[posIndex + i]);
                }
                let normal = rounded.faceNormal(faceIndex);
                for (let i = 0; i < 3; i++) {
                    normals.push(normal.x, normal.y, normal.z);
                }
            }

            newGeometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
            newGeometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
            geometries.push(newGeometry);
        }

        return geometries;
    }

    bufferGeometry() {
        let newGeometry = new THREE.BufferGeometry();
        let normals = [];
        let roundedCBG = this.clone();
        roundedCBG.roundVerticesToFloat();
        for (let faceIndex = 0; faceIndex < roundedCBG.positions.length / 9; faceIndex++) {
            let posIndex = roundedCBG.positionFromFace(faceIndex);
            let normal = roundedCBG.faceNormal(faceIndex);
            for (let i = 0; i < 3; i++) {
                normals.push(normal.x, normal.y, normal.z);
            }
        }
        newGeometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(roundedCBG.positions), 3));
        newGeometry.addAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
        return newGeometry;
    }

    // round vertices to the nearest Float32 value.  This eliminates
    // degenerates when saving the file.
    roundVerticesToFloat() {
        this.positions = Array.from(new Float32Array(this.positions));
        this.removeDegenerates(Array.from(new Array(this.positions.length/9).keys()));
        this.deleteDegenerates();
        let normal0Count = 0;
        for (let f=0; f < this.positions.length/9; f++) {
            if (this.faceNormal(f).length() == 0) {
                normal0Count++;
            }
        }
    }

    // Returns all positions in the face, starting from the vertex specified.
    positionsFromFace(faceIndex, vertexIndex) {
        let p1 = this.positionFromFaceEdge(faceIndex, vertexIndex);
        let p2 = this.nextPositionInFace(p1);
        let p3 = this.nextPositionInFace(p2);
        return [p1, p2, p3];
    }

    // Gets all Vector3s for the positionList
    vector3sFromPositions(positionList, positions) {
        return positionList.map(p => this.vector3FromPosition(p, positions));
    }

    getNeighborPosition(position) {
        return this.neighbors[position/3]*3;
    }

    // copy the x,y,z of the points into the array at the offset
    setPointsInArray(points, array, offset) {
        for (let p of points) {
            array[offset++] = p.x;
            array[offset++] = p.y;
            array[offset++] = p.z;
        }
    }

    // Returns the unit normal of a triangular face.
    faceNormal(faceIndex) {
        let [p0, p1, p2] =
            this.positionsFromFace(faceIndex, 0);
        return new THREE.Triangle(...this.vector3sFromPositions([p0, p1, p2], this.positions)).normal();
    }

    // Split all edges in this geometry so that there are no edges
    // that cross the plane.
    splitFaces(plane) {
        // Maintain a list of positions that intersect the plane.
        // Each position is on the plane.
        let splitPositions = new Set();

        /* Given the face and edge index, split that edge at the point
           where it crosses the plane.

           If the edge doesn't cross the plane, do nothing.

           If the edge crosses the plane, split the face into two
           faces.  One face is modified in place, the other is added
           to the end of the faces array.  The faces that are added to
           the end is the one that doesn't require more splitting.
           The neighboring face is adjusted and a new neighbor is
           made, too.  this.neighbors and this.islands are updated.
        */
        let splitFace = (faceIndex, edgeIndex, plane) => {
            let positions = []; // 2D array, element 0 is for current face, element 1 for neighbor.
            positions[0] = this.positionsFromFace(faceIndex, edgeIndex);
            if (splitPositions.has(positions[0][0]) || splitPositions.has(positions[0][1])) {
                // One of the end ponts is already split so there's no
                // need to split here.  This saves us from creating
                // degenerate triangles when the interseciton
                // calculation isn't an exact value.
                return 0;
            }
            positions[1] = [this.getNeighborPosition(positions[0][0])];
            positions[1].push(this.nextPositionInFace(positions[1][0]),
                              this.previousPositionInFace(positions[1][0]));
            let vertices = []; // 2D array, element 0 is for current face, element 1 for neighbor.
            for (let i = 0; i < 2; i++) {
                vertices[i] = this.vector3sFromPositions(positions[i], this.positions);
            }

            let edge = new THREE.Line3(vertices[0][0], vertices[1][0]);
            let intersectionPoint = plane.intersectLine(edge);
            if (intersectionPoint === undefined ||
                intersectionPoint.equals(vertices[0][0]) ||
                intersectionPoint.equals(vertices[0][1])) {
                return 0;
            }

            let vertexToMove = [];
            for (let i = 0; i < 2; i++) {
                let secondIntersectionPoint = plane.intersectLine(new THREE.Line3(vertices[i][0], vertices[i][2]));
                // Which vertex needs to be moved to the intersection
                // so that the new face created won't need further
                // splitting?
                if (secondIntersectionPoint === undefined ||
                    this.keyForVector3(secondIntersectionPoint) == this.keyForVector3(vertices[i][0]) ||
                    this.keyForVector3(secondIntersectionPoint) == this.keyForVector3(vertices[i][2])) {
                    // No intersection with plane from position 0 to
                    // position 2, so let that be part of the new face.
                    vertexToMove[i] = 0;
                } else {
                    vertexToMove[i] = 1;
                }
            }

            for (let i = 0; i < 2; i++) {
                // The intersectionPoint replaces the vertex from above.
                this.setPointsInArray([intersectionPoint], this.positions, positions[i][vertexToMove[i]]);
                splitPositions.add(positions[i][vertexToMove[i]]);
                // A new face needs to be added for the other side of the triangle.
                if (vertexToMove[i] == 0) {
                    this.setPointsInArray([vertices[i][2], vertices[i][0], intersectionPoint],
                                          this.positions, this.positions.length);
                    splitPositions.add(this.positions.length-3);
                } else {
                    this.setPointsInArray([intersectionPoint, vertices[i][1], vertices[i][2]],
                                          this.positions, this.positions.length);
                    splitPositions.add(this.positions.length-9);
                }
            }

            // Add to this.neighbors
            let newNeighborIndex = this.neighbors.length;
            if (vertexToMove[0] == 1 && vertexToMove[1] == 1) {
                this.neighbors.push(positions[1][0]/3,
                                    this.neighbors[positions[0][1]/3],
                                    positions[0][1]/3);
                this.neighbors.push(positions[0][0]/3,
                                    this.neighbors[positions[1][1]/3],
                                    positions[1][1]/3);
            } else if (vertexToMove[0] == 0 && vertexToMove[1] == 0) {
                this.neighbors.push(this.neighbors[positions[0][2]/3],
                                    positions[1][0]/3,
                                    positions[0][2]/3);
                this.neighbors.push(this.neighbors[positions[1][2]/3],
                                    positions[0][0]/3,
                                    positions[1][2]/3);
            } else if (vertexToMove[0] == 1 && vertexToMove[1] == 0) {
                this.neighbors.push(newNeighborIndex + 4,
                                    this.neighbors[positions[0][1]/3],
                                    positions[0][1]/3);
                this.neighbors.push(this.neighbors[positions[1][2]/3],
                                    newNeighborIndex,
                                    positions[1][2]/3);
            } else if (vertexToMove[0] == 0 && vertexToMove[1] == 1) {
                this.neighbors.push(this.neighbors[positions[0][2]/3],
                                    newNeighborIndex + 3,
                                    positions[0][2]/3);
                this.neighbors.push(newNeighborIndex + 1,
                                    this.neighbors[positions[1][1]/3],
                                    positions[1][1]/3);
            }

            // Make the above assignments symmetric.
            for (let i = newNeighborIndex; i < newNeighborIndex+6; i++) {
                this.neighbors[this.neighbors[i]] = i;
            }
            // Update the reverseIslands.
            this.reverseIslands[this.faceFromPosition(this.positions.length-18)] =
                this.reverseIslands[this.faceFromPosition(positions[0][0])];
            this.reverseIslands[this.faceFromPosition(this.positions.length- 9)] =
                this.reverseIslands[this.faceFromPosition(positions[1][0])];
            return 1;
        }
        let splitsMade = 0;

        const faceCount = this.positions.length/9;
        for (let f = 0; f < faceCount; f++) {
            for (let e = 0; e < 3; e++) {
                splitsMade += splitFace(f, e, plane);
            }
        }
        return splitsMade;
    }

    debugLog(...args) {
        //console.log(...args);
    }

    // Merge faces where possible.
    //
    // Look for edges where one of the points could be moved to the
    // other point without affecting the shape.  To check this, we
    // look at the normals of all affected faces before and after the
    // move.  The two faces adjacent to the collapsed edge should
    // become degenerate.  The rest should have their normals
    // unchanged.  If that's true, the collapse is valid.
    //
    // Normal unchanged means that the the normal before and after are
    // the same within a small tollerance, like 0.0001.
    //
    // The faces that collpase to degenerates need to later be removed.
    mergeFaces() {
        const faceCount = this.positions.length / 9;
        let facesMerged = 0;
        let previousFacesMerged = 0;
        do {
            previousFacesMerged = facesMerged;
            for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
                for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                    if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                        // This face is already a degenerate from previous
                        // merge operations but not yet deleted from
                        // this.positions .  Stop processing it.
                        // Eventually it will be removed from
                        // this.positions.
                        break;
                    }
                    let startPosition = this.positionFromFaceEdge(faceIndex, edgeIndex);
                    let currentPosition = startPosition;
                    let start = this.vector3FromPosition(startPosition, this.positions);
                    // Test if moving the point would affect any face normals.
                    do {
                        currentPosition = this.getNeighborPosition(this.nextPositionInFace(currentPosition));
                        let nextPosition = this.nextPositionInFace(currentPosition);
                        let thirdPosition = this.nextPositionInFace(nextPosition);
                        let neighborVertices = this.vector3sFromPositions([currentPosition,
                                                                           nextPosition,
                                                                           thirdPosition],
                                                                          this.positions);
                        let neighborNormal = new THREE.Triangle(...neighborVertices).normal();
                        // After moving the vertex, this will be the new normal.
                        let newNeighborNormal = new THREE.Triangle(neighborVertices[0],
                                                                   start,
                                                                   neighborVertices[2]).normal();
                        if (newNeighborNormal.length() != 0 &&
                            this.keyForVector3(neighborNormal, 3) !=
                            this.keyForVector3(newNeighborNormal, 3)) {
                            break;
                        }
                    } while (currentPosition != startPosition);
                    if (currentPosition == startPosition) {
                        // We didn't break so this triangle should be collapsable.
                        facesMerged++;
                        let faces = [];
                        do {
                            let nextPosition = this.nextPositionInFace(currentPosition);
                            this.setPointsInArray([start], this.positions, nextPosition);
                            faces.push(this.faceFromPosition(currentPosition));
                            currentPosition = this.getNeighborPosition(nextPosition);
                        } while (currentPosition != startPosition);
                        this.removeDegenerates(faces);
                    }
                }
            }
            this.deleteDegenerates();
        } while (facesMerged != previousFacesMerged);
        return facesMerged;
    }

    removeDegenerates(faces) {
        let previousTotalDegeneratesRemoved = 0;
        let totalDegeneratesRemoved = 0;
        let degeneratesRemoved = 0;
        do {
            previousTotalDegeneratesRemoved = totalDegeneratesRemoved;
            totalDegeneratesRemoved += this.removeDegenerates0Angle(faces);
            totalDegeneratesRemoved += this.removeDegenerates180Angle(faces);
        } while(previousTotalDegeneratesRemoved != totalDegeneratesRemoved);
        return totalDegeneratesRemoved;
    }

    // Remove degenerates where two of 3 vertices are the same.
    removeDegenerates0Angle(faces) {
        let degeneratesRemoved = 0;
        for (let faceIndex of faces) {
            if (this.reverseIslands[faceIndex] === null) {
                // Already going to be removed.
                continue;
            }
            // Find if there are two identical vertices.
            for (let edgeIndex = 0; edgeIndex < 3; edgeIndex++) {
                let position = this.positionFromFaceEdge(faceIndex, edgeIndex);
                let nextPosition = this.nextPositionInFace(position);
                if (this.equalTrios(position, nextPosition)) {
                    // Found a degenerate.
                    degeneratesRemoved++;
                    let edge1 = nextPosition;
                    let edge2 = this.nextPositionInFace(edge1);
                    // Connect their neighbors.
                    if (Number.isInteger(this.neighbors[edge1/3])) {
                        this.neighbors[this.neighbors[edge1/3]] = this.neighbors[edge2/3];
                    }
                    if (Number.isInteger(this.neighbors[edge2/3])) {
                        this.neighbors[this.neighbors[edge2/3]] = this.neighbors[edge1/3];
                    }
                    this.reverseIslands[faceIndex] = null;
                }
            }
        }
        return degeneratesRemoved;
    }

    // Reconnect faces with a normal of 0 due to a 180 degree angle so
    // that the output will have only faces with normal non-zero.  We
    // check if the normal is 0 as a 32-bit float.
    removeDegenerates180Angle(faces) {
        let degeneratesRemoved = 0;
        for (let faceIndex of faces) {
            if (this.reverseIslands[faceIndex] === null ||
                this.isFaceDegenerate(faceIndex)) {
                // Already going to be removed or is degenerate.
                continue;
            }
            // positions[0] for current face, positions[1] for
            // neighbor.
            let positions = [];
            positions[0] = this.positionsFromFace(faceIndex, 0);
            let vertices = [];
            vertices[0] = this.vector3sFromPositions(positions[0], this.positions);
            let normal = new THREE.Triangle(...vertices[0]).normal().length();
            let floatNormal = Array.from(new Float32Array([normal]))[0];
            if (floatNormal != 0 ) {
                // Nothing to do.
                continue;
            }
            // Try to find largest angle, it should be the 180
            // degree angle.
            let largestIndex = 0;
            let largestAngle = -Infinity;
            for (let i = 0; i < 3; i++) {
                let left = vertices[0][i % 3];
                let middle = vertices[0][(i+1) % 3];
                let right = vertices[0][(i+2) % 3];
                let angle = left.clone().sub(middle).angleTo(right.clone().sub(middle));
                if (angle > largestAngle) {
                    largestIndex = (i+1) % 3; // The middle point of a 180 degree angle.
                    largestAngle = angle;
                }
            }
            // Move positions so that positions[0][1] sits on the line
            // between positions[0][0] and positions[0][2].
            positions[0] = this.positionsFromFace(faceIndex, (largestIndex+2) % 3);
            // Get neighbors so that positions[0][2] is connected to
            // positions[1][0] and positions[1][2] is connected to
            // positions[0][0].
            positions[1] = [this.nextPositionInFace(this.getNeighborPosition(positions[0][2]))];
            positions[1].push(this.nextPositionInFace(positions[1][0]),
                              this.previousPositionInFace(positions[1][0]));
            for (let i = 0; i < 2; i++) {
                vertices[i] = this.vector3sFromPositions(positions[i], this.positions);
            }
            for (let i = 0; i < 2; i++) {
                this.setPointsInArray([vertices[i][1]], this.positions, positions[1-i][2]);
            }
            // Adjust neighbors.
            for (let i=0; i < 2; i++) {
                this.neighbors[positions[  i][2]/3] = this.neighbors[positions[1-i][1]/3];
                this.neighbors[positions[1-i][1]/3] =                positions[  i][1]/3;
            }
            // Make the above assignments symmetric.
            for (let i = 0; i < 2; i++) {
                for (let j = 0; j < 3; j++) {
                    this.neighbors[this.neighbors[positions[i][j]/3]] = positions[i][j]/3;
                }
            }

            degeneratesRemoved++;
        }
        return degeneratesRemoved;
    }

    // Rewrite the list of faces without the degenerates in it.
    deleteDegenerates() {
        const faceCount = this.positions.length / 9;

        let degeneratesRemoved = 0;
        let newPositions = [];
        let newFaceIndex = [];
        let newReverseIslands = [];
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            if (!Number.isInteger(this.reverseIslands[faceIndex])) {
                // Degenerate not part of any island.
                degeneratesRemoved++;
                continue;
            }
            newPositions.push(...this.positions.slice(faceIndex*9, (faceIndex+1)*9));
            newReverseIslands.push(this.reverseIslands[faceIndex]);
            newFaceIndex[faceIndex] = faceIndex - degeneratesRemoved;
        }
        let newNeighbors = [];
        for (let oldFaceIndex = 0; oldFaceIndex < faceCount; oldFaceIndex++) {
            for (let oldEdgeIndex = 0; oldEdgeIndex < 3; oldEdgeIndex++) {
                if (!Number.isInteger(newFaceIndex[oldFaceIndex])) {
                    continue;
                }
                let oldPosition = this.positionFromFaceEdge(oldFaceIndex, oldEdgeIndex);
                let oldNeighborPosition = this.getNeighborPosition(oldPosition);
                let newPosition = this.positionFromFaceEdge(newFaceIndex[oldFaceIndex],
                                                            oldEdgeIndex);
                let newNeighborPosition = this.positionFromFaceEdge(newFaceIndex[this.faceFromPosition(oldNeighborPosition)],
                                                                    this.edgeFromPosition(oldNeighborPosition));
                newNeighbors[newPosition/3] = newNeighborPosition/3;
            }
        }

        this.positions = newPositions;
        this.neighbors = newNeighbors;
        this.reverseIslands = newReverseIslands;
        return degeneratesRemoved;
    }
}

export { ConnectedBufferGeometry };

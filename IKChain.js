import * as THREE from 'three'

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const LEFT = new THREE.Vector3(1, 0, 0);

// O(nm)
function findIndexOfBoneByName( skeleton, name ){
    if ( !name ){ return -1; }
    name = name.replace( "mixamorig_", "" ).replace("mixamorig:", "").replace( "mixamorig", "" );
    let b = skeleton.bones;
    for( let i = 0; i < b.length; ++i ){
        if ( b[i].name.replace( "mixamorig_", "" ).replace("mixamorig:", "").replace( "mixamorig", "" ) == name ){ return i; }
    }
    return -1;
}

class IKBone {
    
    constructor( idx, length) {

        
        this.parentIdx = -1; // Bone parent idx
        this.idx = idx; // Bone idx
        this.length = length || 0; // Bone lenght
        this.bindTransform = { // LS bind pose transform
            position: new THREE.Vector3(),
            quaternion: new THREE.Quaternion(),
            scale: new THREE.Vector3()
        };

        this.effectorDirection = UP.clone(); // WS target direction
        this.poleDirection = FORWARD.clone(); // WS Bend direction
        this.direction = FORWARD.clone();
    }

    static fromBoneName(skeleton, boneName ) {
        const idx = findIndexOfBoneByName(skeleton, boneName);
        if(idx < 0) {
            return;
        }
        const bone = skeleton.bones[idx];
        
        let parentIdx = -1;
        let len = 0;
        let dir = null;
        if(idx > -1 && bone.parent) {
            parentIdx = findIndexOfBoneByName(skeleton, bone.parent.name);

            len = IKBone.computeBoneLength(skeleton, idx, parentIdx);
            dir = IKBone.computeBoneDirection(skeleton, idx, parentIdx);
        }
        
        const ikBone = new IKBone(idx, len);
        if(dir) {
            ikBone.direction.copy(dir);
        }
        ikBone.parentIdx = parentIdx;
        ikBone.bindTransform.position.copy(skeleton.bones[idx].position);
        ikBone.bindTransform.quaternion.copy(skeleton.bones[idx].quaternion);
        ikBone.bindTransform.scale.copy(skeleton.bones[idx].scale);

        return ikBone;
    }

    static computeBoneLength( skeleton, idx = this.idx, parentIdx = this.parentIdx) {
        if(parentIdx < 0) {
            return 0;
        }
        let parentPos = skeleton.bones[parentIdx].getWorldPosition(new THREE.Vector3());
        let pos = skeleton.bones[idx].getWorldPosition(new THREE.Vector3());

        if(skeleton.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(skeleton.transformsWorldEmbedded.forward.p, skeleton.transformsWorldEmbedded.forward.q, skeleton.transformsWorldEmbedded.forward.s);
            let mat = skeleton.bones[parentIdx].matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(parentPos, new THREE.Quaternion(), new THREE.Vector3());

            mat = skeleton.bones[idx].matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        }
        return parentPos.distanceTo(pos);
    }

    static computeBoneDirection( skeleton, idx = this.idx, parentIdx = this.parentIdx) {
        if(parentIdx < 0) {
            return 0;
        }
        let parentPos = skeleton.bones[parentIdx].getWorldPosition(new THREE.Vector3());
        let pos = skeleton.bones[idx].getWorldPosition(new THREE.Vector3());

        if(skeleton.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(skeleton.transformsWorldEmbedded.forward.p, skeleton.transformsWorldEmbedded.forward.q, skeleton.transformsWorldEmbedded.forward.s);
            let mat = skeleton.bones[parentIdx].matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(parentPos, new THREE.Quaternion(), new THREE.Vector3());

            mat = skeleton.bones[idx].matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        }
        return new THREE.Vector3().subVectors(pos, parentPos).normalize();
    }
}

class IKChain {
    constructor( skeleton, name, bonesName, endEffectorName = null ) {
        this.name = name;
        this.solver = null;
        this.length = null;
        this.count = 0;
        this.bonesInfo = [];
        this.setBones(skeleton, name, bonesName, endEffectorName);
    }

    setBones( skeleton, name, bonesName, endEffectorName) {
        let bones = [];

        for(let i = 0; i < bonesName.length; i ++) {
            const ikBone = IKBone.fromBoneName(skeleton, bonesName[i]);

            if(!ikBone) {
                console.warn(bonesName[i] + ": Bone not found")
                continue;
            }
            this.bonesInfo.push(ikBone);
            this.length += ikBone.length;
        }

        this.count = this.bonesInfo.length;
    }

    setAltDirections( effectorDirection, poleDirection ) {
        
        for( let ikBone of this.bonesInfo ){
            ikBone.effectorDirection.copy( effectorDirection );
            ikBone.poleDirection.copy( poleDirection );
        }
        return this;
    }

    bindDirections( pose, effectorDirection = new THREE.Vector3(), poleDirection = new THREE.Vector3() ) {

        const v   = new THREE.Vector3()
        const inv = new THREE.Quaternion()
        
        for( let ikBone of this.bonesInfo ) {
            pose.bones[ ikBone.idx ].getWorldQuaternion(inv);
            if(pose.transformsWorldEmbedded) {
                inv.premultiply(pose.transformsWorldEmbedded.forward.q)
            }

            inv.invert();

            if( effectorDirection ){
                v.copy(effectorDirection).applyQuaternion( inv );
                ikBone.effectorDirection.copy( v );
            }

            if( poleDirection ){
                v.copy(poleDirection).applyQuaternion( inv );
                ikBone.poleDirection.copy( v );
            }
        }

        return this;
    }

    setSolver ( solver ) {
        this.solver = solver;
    }

    // Change the Bind Transform
    // Mostly used for late binding a TPose when armature isn't naturally in a TPose
    bindToPose( pose ) {

        for( let ikBone of this.bonesInfo ){
            ikBone.bindTransform.position.copy(pose.bones[idx].position);
            ikBone.bindTransform.quaternion.copy(pose.bones[idx].quaternion);
            ikBone.bindTransform.scale.copy(pose.bones[idx].scale);
        }
        return this;
    }

    /** For usecase when bone lengths have been recomputed for a pose which differs from the initial armature */
    resetLengths( pose) {
        
        this.length = 0;
        for( let ikBone of this.bonesInfo ){
            let lenght = ikBone.computeBoneLength(pose);
            ikBone.lenght = lenght;                          // Save it to Link
            this.length += lenght;                         // Accumulate the total chain length
        }
    }

    resolveToPose( pose, debug = false ) {
        if( !this.solver ){ 
            console.warn( this.name + ': Missing Solver' ); 
            return this; 
        }
        this.solver.resolve( this, pose, debug );
        return this;
    }

    getStartPosition( pose ) {
        const bone = pose.bones[ this.bonesInfo[ 0 ].idx ];
        let pos = bone.getWorldPosition(new THREE.Vector3());

        if(pose.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            let mat = bone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        }
        return pos;
    }

    getMiddlePosition( pose ) {
        if( this.count == 2 ){
            const bone = pose.bones[ this.bonesInfo[ 1 ].idx ];
            let pos = bone.getWorldPosition(new THREE.Vector3());

            if(pose.transformsWorldEmbedded) {
                let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
                let mat = bone.matrixWorld.clone();
                mat.premultiply(cmat);
                mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
            }
            return pos;
        }
        console.warn( 'TODO: Implemenet IKChain.getMiddlePosition' );
        return new THREE.Vector3();
    }

    getTailPosition( pose, ignoreScale = false ) {
        const bone = pose.bones[ this.bonesInfo[ this.count - 1 ].idx ];
        const v = this.bonesInfo[ this.count - 1].direction.clone().multiplyScalar( this.bonesInfo[ this.count - 1].length );
        
        let pos = bone.getWorldPosition(new THREE.Vector3());
        let quat = bone.getWorldQuaternion(new THREE.Quaternion());
        let scl = bone.getWorldScale(new THREE.Vector3());
        if(pose.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            let mat = bone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, quat, scl);
        }

        if( !ignoreScale ) {
            return transformVector3( pos, quat, scl, v);
        }

        v.applyQuaternion(quat);
        v.add(pos);
        
        return v;
    }

    getPositionAt( pose, idx) {
        const bone = pose.bones[ this.bonesInfo[ idx ].idx ];
        let pos = bone.getWorldPosition(new THREE.Vector3());

        if(pose.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            let mat = bone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
        }

        return pos;
    }
}

export {IKChain}

function transformVector3( pos, quat, scl, vector) {
    let v = vector.clone().multiply(scl);
    v.applyQuaternion(quat);

    return v.add(pos);
}

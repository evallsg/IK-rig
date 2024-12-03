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
        this.length = length || 0; // Bone length
        this.bindTransform = {
            local: { // LS bind pose transform
                position: new THREE.Vector3(),
                quaternion: new THREE.Quaternion(),
                scale: new THREE.Vector3()
            },
            world: { // WS bind pose transform
                position: new THREE.Vector3(),
                quaternion: new THREE.Quaternion(),
                scale: new THREE.Vector3()
            }
        };

        this.effectorDirection = UP.clone(); // WS target direction
        this.poleDirection = FORWARD.clone(); // WS Bend direction
        this.direction = UP.clone();
    }

    static fromBoneName(skeleton, boneName ) {
        const idx = findIndexOfBoneByName(skeleton, boneName);
        if(idx < 0) {
            return;
        }
        const bone = skeleton.bones[idx];
        
        let parentIdx = -1;

        if(idx > -1 && bone.parent) {
            parentIdx = findIndexOfBoneByName(skeleton, bone.parent.name);
        }
        
        const ikBone = new IKBone(idx);
        
        ikBone.parentIdx = parentIdx;
        
        // Set local transforms
        ikBone.bindTransform.local.position.copy(skeleton.bones[idx].position);
        ikBone.bindTransform.local.quaternion.copy(skeleton.bones[idx].quaternion);
        ikBone.bindTransform.local.scale.copy(skeleton.bones[idx].scale);

        // Set world transforms
        let bonePos = bone.getWorldPosition(new THREE.Vector3());
        let boneRot = bone.getWorldQuaternion(new THREE.Quaternion());
        let boneScl = bone.getWorldScale(new THREE.Vector3());    
        if(skeleton.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(skeleton.transformsWorldEmbedded.forward.p, skeleton.transformsWorldEmbedded.forward.q, skeleton.transformsWorldEmbedded.forward.s);
            let mat = bone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(bonePos, boneRot, boneScl);
        }
        ikBone.bindTransform.world.position.copy(bonePos);
        ikBone.bindTransform.world.quaternion.copy(boneRot);
        ikBone.bindTransform.world.scale.copy(boneScl);

        return ikBone;
    }

    static computeBone( skeleton, idx = this.idx) {
        const bone = skeleton.bones[idx];
        if(!bone.children.length) {
            return [null, null];
        }
        
        let pos = bone.getWorldPosition(new THREE.Vector3());
        let childPos = bone.children[0].getWorldPosition(new THREE.Vector3());

        if(skeleton.transformsWorldEmbedded) {
            let cmat = new THREE.Matrix4().compose(skeleton.transformsWorldEmbedded.forward.p, skeleton.transformsWorldEmbedded.forward.q, skeleton.transformsWorldEmbedded.forward.s);
            let mat = bone.matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());

            mat = bone.children[0].matrixWorld.clone();
            mat.premultiply(cmat);
            mat.decompose(childPos, new THREE.Quaternion(), new THREE.Vector3());
        }

        const dir = new THREE.Vector3().subVectors(childPos, pos);
        return [dir.clone().length(), dir.normalize()];
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
           
            const [len, direction] = IKBone.computeBone( skeleton, ikBone.idx );
            if(len) {
                ikBone.length = len;
            }
            if(direction) {
                ikBone.direction.copy(direction);                
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

        for( let ikBone of this.bonesInfo ) {
            // Set local transforms
            ikBone.bindTransform.local.position.copy(pose.bones[idx].position);
            ikBone.bindTransform.local.quaternion.copy(pose.bones[idx].quaternion);
            ikBone.bindTransform.local.scale.copy(pose.bones[idx].scale);

            // Set world transforms
            let bonePos = bone.getWorldPosition(new THREE.Vector3());
            let boneRot = bone.getWorldQuaternion(new THREE.Quaternion());
            let boneScl = bone.getWorldScale(new THREE.Vector3());    
            if(pose.transformsWorldEmbedded) {
                let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
                let mat = bone.matrixWorld.clone();
                mat.premultiply(cmat);
                mat.decompose(bonePos, boneRot, boneScl);
            }
            ikBone.bindTransform.world.position.copy(bonePos);
            ikBone.bindTransform.world.quaternion.copy(boneRot);
            ikBone.bindTransform.world.scale.copy(boneScl);
        }
        return this;
    }

    /** For usecase when bone lengths have been recomputed for a pose which differs from the initial armature */
    resetLengths( pose) {
        
        this.length = 0;
        for( let ikBone of this.bonesInfo ){
            let length = ikBone.computeBoneLength(pose);
            ikBone.length = length;                          // Save it to Link
            this.length += length;                         // Accumulate the total chain length
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
        const boneInfo = this.bonesInfo[ this.count - 1 ];
        const bone = pose.bones[ boneInfo.idx ];
        const v = new THREE.Vector3(0, boneInfo.length, 0);
      
        if( !ignoreScale ) {
            return transformVector3( boneInfo.bindTransform.world.position, boneInfo.bindTransform.world.quaternion, boneInfo.bindTransform.world.scale, v);
        }

        v.applyQuaternion(boneInfo.bindTransform.world.quaternion);
        v.add(boneInfo.bindTransform.world.position);
        
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

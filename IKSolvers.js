import * as THREE from 'three'

class SwingTwistSolver {
    constructor ( ) {

        this.isTargetPosition = false;

        this.originPoleDirection = new THREE.Vector3(); // Pole gets updated based on effector direction, so keep originally set dir to compute the orthogonal poleDirection
        this.originPosition = new THREE.Vector3(); // Starting WS position of the chain
        
        this.effectorScale = 1;
        this.effectorPosition = new THREE.Vector3();
        this.effectorDirection = new THREE.Vector3();
        this.poleDirection = new THREE.Vector3(); // Direction that handles the twisting rotation
        this.crossDirection = new THREE.Vector3(); // Direction that handles the bending rotation (elbow, knees...)
    }

    init( pose, chain ) {
        if( pose && chain) {
            const origin = chain.bonesInfo[0];
            let rotation = pose.bones[origin.idx].getWorldQuaternion(new THREE.Vector3());
            if(pose.transformsWorldEmbedded) {
                rotation.premultiply(pose.transformsWorldEmbedded.forward.q)
            }

            const effector = origin.effectorDirection.clone().applyQuaternion(rotation);
            const pole = origin.poleDirection.clone().applyQuaternion(rotation);

            this.setTargetDirection( effector, pole);
        }
    }

    setTargetPosition( effector, pole) {
        this.isTargetPosition = true;
        this.effectorPosition.copy(effector);
        
        if( pole ) {
            this.setTargetPole( pole );
        }
        return this;
    }

    setTargetDirection( effector, pole, effectorScale = null) {
        this.isTargetPosition = false;
        this.effectorDirection.copy(effector);
        
        if( pole ) {
            this.setTargetPole( pole );
        }

        if( effectorScale ) {
            this.effectorScale = effectorScale;
        }
        return this;
    }

    setTargetPole( pole ) {
        this.originPoleDirection.copy(pole);
        return this;
    }

    resolve( chain, pose, debug = false ) {
        const [ rot, pRot ] = this.getWorldRotation( chain, pose, debug );
        rot.premultiply(pRot.invert()); // To Local Space
        pose.bones[chain.bonesInfo[ 0 ].idx].quaternion.copy(rot); // Save to Pose
    }

    getWorldRotation( chain, pose, debug = false ) {
        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        let ikBone = chain.bonesInfo[0];

        let parentMat = pose.bones[ikBone.idx].parent ? pose.bones[ikBone.idx].parent.matrixWorld.clone() : new THREE.Matrix4();
        
        // Get the Starting Transform
        if(pose.transformsWorldEmbedded) {
            const mat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            parentMat.premultiply(mat);
        }
        let parentPos = new THREE.Vector3();
        let parentRot = new THREE.Quaternion();
        let parentScale = new THREE.Vector3();

        parentMat.decompose(parentPos, parentRot, parentScale);
        // Get Bone's BindPose position in relation to this pose
        const mat = new THREE.Matrix4().compose(ikBone.bindTransform.position, ikBone.bindTransform.quaternion, ikBone.bindTransform.scale);
        mat.multiply(parentMat);
        let pos = new THREE.Vector3();
        let rot = new THREE.Quaternion();
        mat.decompose(pos, rot, new THREE.Vector3());

        this.update( pos );         // Update Data to use new Origin.

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // const rot : quat = quat.copy( [0,0,0,1], ct.rot );
        // const dir : vec3 = [0,0,0];
        // const q   : quat = [0,0,0,1];
        
        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Swing
        let direction = ikBone.effectorDirection.clone().applyQuaternion(rot).normalize(); // Get WS Binding Effector Direction of the Bone
        let swing = new THREE.Quaternion().setFromUnitVectors(direction, this.effectorDirection);        // Rotation TO IK Effector Direction
        swing.multiply(rot);                            // Apply to Bone WS Rot

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Twist
        if( this.poleDirection.lengthSq() > 0.0001 ){
            direction.copy(ikBone.poleDirection).applyQuaternion( swing ).normalize();    // Get WS Binding Pole Direction of the Bone
            let twist = new THREE.Quaternion().setFromUnitVectors(direction, this.poleDirection );        // Rotation to IK Pole Direction
            swing.premultiply( twist );                        // Apply to Bone WS Rot + Swing
        }

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Kinda Hacky putting this here, but its the only time where there is access to chain's length for all extending solvers.
        // So if not using a TargetPosition, means we're using Direction then we have to compute the effectorPos.
        if( !this.isTargetPosition ){
            this.effectorPosition = new THREE.Vector3().addVectors( this.originPosition, this.effectorDirection.clone().multiplyScalar( chain.length * this.effectorScale));
        }

        let arrowHelper = window.globals.app.scene.getObjectByName("target" );
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper(direction, pos, 0.2, "pink" );
            arrowHelper.line.material = new THREE.LineBasicMaterial({color: "pink", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest: false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "target";
            window.globals.app.scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(direction);
            arrowHelper.position.copy(pos);
        }

        arrowHelper = window.globals.app.scene.getObjectByName("otarget" );
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper(this.effectorDirection, pos, 0.2, "red" );
            arrowHelper.line.material = new THREE.LineBasicMaterial({color: "red", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest: false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "otarget";
            window.globals.app.scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(this.effectorDirection);
            arrowHelper.position.copy(pos);
        }
        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        return [ swing, parentRot ];
    }

     /** Update Target Data  */
     update( origin ) {

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Compute the Effector Direction if only given effector position
        if( this.isTargetPosition ){
            this.effectorDirection.subVectors(this.effectorPosition, origin ).normalize();     // Forward Axis Z
        }

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Left axis X - Only needed to make pole orthogonal to effector
        this.crossDirection.crossVectors( this.originPoleDirection, this.effectorDirection ).normalize();

        // Up Axis Y 
        this.poleDirection.crossVectors(this.effectorDirection, this.crossDirection ).normalize();

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        this.originPosition.copy( origin );
    }

    ikDataFromPose( chain, pose ) {
        const ikBone = chain.bonesInfo[0];
        const bone   = pose.bones[ ikBone.idx ];
        
        let dir = new THREE.Vector3();
        let rotation = bone.getWorldQuaternion(new THREE.Vector3());
        if(pose.transformsWorldEmbedded) {
            rotation.premultiply(pose.transformsWorldEmbedded.forward.q)
        }
        // Alt Effector
        dir.copy(ikBone.effectorDirection).applyQuaternion(rotation);
        const effectorDirection = dir.normalize();;

        // Alt Pole
        dir.copy(ikBone.poleDirection).applyQuaternion(rotation);
        const poleDirection = dir.normalize();

        return {effectorDirection, poleDirection};
    }
}

class SwingTwistBase {

    constructor( ) {
        this.solver = new SwingTwistSolver();
    }

    init( pose, chain) {
        if( pose && chain ) {
            this.solver.init( pose, chain );
        }
        return this;
    }

    setTargetDirection( effector, pole, effectorScale) { 
        this.solver.setTargetDir( effector, pole, effectorScale ); 
        return this;
    }

    setTargetPosition( effector, pole) { 
        this.solver.setTargetPosition( effector, pole );
        return this;
    }
    setTargetPole( effector ) { 
        this.solver.setTargetPole( effector );
        return this;
    }
    
    resolve( chain, pose, debug = false ) { }

    ikDataFromPose( chain, pose, out) {
        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Length Scaled & Effector Direction
        const origin = chain.getStartPosition( pose );
        const end = chain.getTailPosition( pose, true );
        const dir = new THREE.Vector3().subVectors( end, origin );
        
        out.lenScale = dir.length() / chain.length;
        out.effectorDirection = dir.normalize();

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Pole Direction
        const ikBone = chain.bonesInfo[0];            // Chain Link : Pole is based on the first Bone's Rotation
        const bone = pose.bones[ ikBone.idx ];    // Bone ref from Pose 

        let rot = bone.getWorldQuaternion(new THREE.Quaternion());
        if(pose.transformsWorldEmbedded) {
            rot.premultiply(pose.transformsWorldEmbedded.forward.q)

        }
        dir.copy(ikBone.poleDirection).applyQuaternion(rot); // Get Alt Pole Direction from Pose
        dir.cross(out.effectorDirection); // Get orthogonal Direction...
        dir.crossVectors(out.effectorDirection, dir); // to Align Pole to Effector
        out.poleDirection.copy(dir.normalize());
    }
}

export default SwingTwistBase;

class HipSolver {
   
    constructor( ) { 
        this.isAbsolute = true;
        this.position = new THREE.Vector3();
        this.bindHeight = 0;
        this.solver = new SwingTwistSolver();
    }

    init( pose, chain ) {
        if( pose && chain) {
            const bone = pose.bones[chain.bonesInfo[0].idx];
            
            let pos = bone.getWorldPosition(new THREE.Vector3());
            if(pose.transformsWorldEmbedded) {
                let mat = bone.matrixWorld.clone();
                let cmat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
                mat.premultiply(cmat);
                mat.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
            }
            this.setMovePosition(pos, this.isAbsolute);
        }
        return this;
    }

    setTargetDirection( effector, pole) 
    {
        this.solver.setTargetDirection( effector, pole );
        return this;
    }

    setTargetPosition( effector, pole ) 
    {
        this.solver.setTargetPosition( effector, pole );
        return this;
    }
    
    setTargetPole( effector ) 
    {
        this.solver.setTargetPole( effector );
        return this;
    }

    setMovePosition( position, isAbsolute = true, bindHeight = 0 ) {
        this.position.copy( position );
        this.isAbsolute     = isAbsolute;
        this.bindHeight     = bindHeight;
        return this;
    }

    resolve( chain, pose, debug = false ) {
        let ikBone = chain.bonesInfo[0];

        let parentMat = pose.bones[ikBone.idx].parent ? pose.bones[ikBone.idx].parent.matrixWorld.clone() : new THREE.Matrix4();
        
        // Get the Starting Transform
        if(pose.transformsWorldEmbedded) {
            const mat = new THREE.Matrix4().compose(pose.transformsWorldEmbedded.forward.p, pose.transformsWorldEmbedded.forward.q, pose.transformsWorldEmbedded.forward.s);
            parentMat.premultiply(mat);
        }
        let parentPos = new THREE.Vector3();
        let parentRot = new THREE.Quaternion();
        let parentScale = new THREE.Vector3();

        parentMat.decompose(parentPos, parentRot, parentScale);
        
        // Get Bone's BindPose position in relation to this pose
        const mat = new THREE.Matrix4().compose(ikBone.bindTransform.position, ikBone.bindTransform.quaternion, ikBone.bindTransform.scale);
        mat.multiply(parentMat);
        let pos = new THREE.Vector3();
        let rot = new THREE.Quaternion();
        mat.decompose(pos, rot, new THREE.Vector3());

        // Invert Transform to Translate Position to Local Space
        //to do

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Which Position Type Are we handling?
        let hipsPosition = this.position.clone(); // Set Absolute Position of where the hip must be
        if( !this.isAbsolute ) {

            // Get Bone's BindPose position in relation to this pose
            hipsPosition.copy(pos);

            if( this.bindHeight == 0 ) {
                hipsPosition.add( this.position );  // Add Offset Position
            }
            else {
                // Need to scale offset position in relation to the Hip Height of the Source
                hipsPosition.addScaledVector(this.position, Math.abs( hipsPosition.y / this.bindHeight ) );
            }
        }

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        let { position, quaternion, scale } = invertTransform(parentPos, parentRot, parentScale);
        hipsPosition = transformVector3( position, quaternion, scale, hipsPosition); // To Local Space
        pose.bones[ikBone.idx].position.copy( hipsPosition );

        this.solver.resolve( chain, pose, debug ); // Apply SwingTwist Rotation
    }
}

export { SwingTwistSolver, HipSolver }

function invertTransform( pos, quat, scl) {
    // Invert Rotation
    const invQ = quat.clone().invert();

    // Invert Scale
    const invScl = new THREE.Vector3(1/scl.x, 1/scl.y, 1/scl.z);

    // Invert Position
    let invPos = pos.clone().negate();
    invPos.multiply(invScl);
    invPos.applyQuaternion(invQ);

    return {position: invPos, quaternion: invQ, scale: invScl}
}

function transformVector3( pos, quat, scl, vector) {
    let v = vector.clone().multiply(scl);
    v.applyQuaternion(quat);

    return v.add(pos);
}
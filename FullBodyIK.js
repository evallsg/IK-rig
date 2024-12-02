import * as THREE from 'three'

class IKPoint {
    constructor( config ) {
        this.idx = -1;
        this.position = new THREE.Vector3();
        this.mass = 1;

        this.isPinned = false;
        this.isPole = false;
        this.draggable = true;
        this.visible = true;

        if (config) {
            if (config.draggable !== void 0) {
                this.draggable = config.draggable;
            }
            if (config.visible !== void 0) {
                this.visible = config.visible;
            }
            if (config.mass !== void 0) {
                this.mass = config.mass;
            }
            if (config.pole !== void 0) {
                this.isPole = config.pole;
            }
            if (config.position) {
                this.position.x = config.position.x;
                this.position.y = config.position.y;
                this.position.z = config.position.z;
            }
        }
    }
    setPosition(position) {
        this.position.x = position.x;
        this.position.y = position.y;
        this.position.z = position.z;
        return this;
    }
}


class P4Cage {
    
    constructor( skeleton, pHead, pTail, pRight, pLeft ){
        this.pHead     = pHead; 
        this.pTail     = pTail;
        this.pRight    = pRight;
        this.pLeft     = pLeft;
        this.pPole     = skeleton.newPoint( { mass:1, pole:true } );

        this.constraints = [
            new DistanceConstraint( this.pRight, this.pLeft ),
            new DistanceConstraint( this.pRight, this.pTail ),
            new DistanceConstraint( this.pLeft, this.pTail ),

            new DistanceConstraint( this.pHead, this.pPole ),
            new DistanceConstraint( this.pHead, this.pTail ),
            new DistanceConstraint( this.pHead, this.pRight ),
            new DistanceConstraint( this.pHead, this.pLeft ),
            
            new DistanceConstraint( this.pPole, this.pTail ),
            new DistanceConstraint( this.pPole, this.pRight ),
            new DistanceConstraint( this.pPole, this.pLeft ),
        ];
    }
    //#endregion

    updatePole(){
        this.pPole.position.x = this.pHead.position.x;
        this.pPole.position.y = this.pHead.position.y;
        this.pPole.position.z = this.pHead.position.z + 0.1;
    }

    rebind() {
        for( let c of this.constraints ) {
            c.rebind();
        }
    }

    resolve(){
        let chg = false;
        
        for( let c of this.constraints ){
            if( c.resolve() ) {
                chg = true;
            }
        }

        return chg;
    }

    poleMode( isOn ) {
        this.pHead.isPinned = isOn;
        //this.pTail.isPinned = isOn;
        return this;
    }

    getHeadPosition( ) {
        return this.pHead.position;
    }

    getAxis( effectorDirection, poleDirection ) {
        const v0 = new THREE.Vector3().subVectors( this.pPole.position, this.pHead.position ).normalize();  // Forward
        const v1 = new THREE.Vector3().subVectors( this.pLeft.position, this.pRight.position ).normalize(); // Left
        const v2 = new THREE.Vector3().crossVectors( v0, v1 );                        // Up

        effectorDirection.copy(v0.normalize());
        poleDirection.copy(v2.normalize());

        
        let arrowHelper = window.globals.app.scene.getObjectByName("front" );
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper(effectorDirection, this.pHead.position, 0.2, "orange" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "orange", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest: false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "front";
            window.globals.app.scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(effectorDirection);
            arrowHelper.position.copy( this.pHead.position);
        }

        arrowHelper = window.globals.app.scene.getObjectByName("up" );
        if(!arrowHelper) {
            arrowHelper = new THREE.ArrowHelper(poleDirection, this.pHead.position, 0.2, "green" );
            arrowHelper.line.material = new THREE.LineDashedMaterial({color: "green", scale: 1, dashSize: 0.1, gapSize: 0.1, depthTest: false})
            arrowHelper.line.computeLineDistances();   
            arrowHelper.name = "up";
            window.globals.app.scene.add(arrowHelper);
        }
        else {
            arrowHelper.setDirection(poleDirection);
            arrowHelper.position.copy( this.pHead.position);
        }
    }
}

class LimbCage {

    constructor( skeleton, pHead, pPole, pTail){
        this.prevPole    = new THREE.Vector3();
        this.pHead     = pHead; 
        this.pPole     = pPole;
        this.pTail     = pTail;
        // Constraints Applied to Points
        this.constraints = [
            new DistanceConstraint( pHead, pPole ),
            new DistanceConstraint( pPole, pTail ),
        ];
    }

    rebind( ) {
        for( let c of this.constraints ) {
            c.rebind();
        }
    }

    resolve( ) {
        let chg = false;
        
        for( let c of this.constraints ) {
            if( c.resolve() ) {
                chg = true;
            }
        }
        return chg;
    }

    poleMode( isOn ) {
        this.pHead.isPinned = isOn;
        return this;
    }

    getTailPos( ) { 
        return this.pTail.pos;
    }

    getPoleDir( poleDirection ) {
        const v0 = THREE.Vector3().subVectors( this.pTail.position, this.pHead.position ).normalize();   // Fwd
        const v1 = THREE.Vector3().subVectors( this.pPole.position, this.pHead.position ).normalize();   // Up

        if( v0,dot( v1 ) < 0.999 ){
            const v2 = THREE.Vector3().crossVectors( v1, v0 );    // Lft
            v1.crossVectors( v0, v2 ).normalize(); // Orthogonal Up
            poleDirection.copy(v1);
            this.prevPole.copy(v1);
        } else {
            poleDirection.copy( this.prevPole );
        }

        return poleDirection;
    }

    setPrevPole( poleDirection ) {
        this.prevPole.copy( poleDirection );
        return this;
    }
}


// Force a distance between Two Points
class DistanceConstraint {
   
    constructor( point1, point2 ){
        this.point1 = point1; // First Point
        this.point2 = point2; // Second Point
        // OPTIONS
        this.point1Anchor     = false;    // First Point is always Pinned
        this.point2Anchor     = false;    // Second Point is always Pinned
        this.isRanged    = false;    // Only Resolve if distance is OVER the len

        // Reuse, so not reallocating them.
        this.direction = new THREE.Vector3();

        this.rebind();
    }

    rebind( ) {
        this.lengthSq      = this.point1.position.distanceToSquared(this.point2.position);  // Distance Squared between Points
        this.length        = Math.sqrt( this.lengthSq );                  // Distance between Points
    }

    ranged( ) 
    { 
        this.isRanged = true;
        return this; 
    }

    resolve( ) {
        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // CHECKS
        
        // If both Points are Pinned, Dont bother
        if( this.point1.isPinned && this.point2.isPinned ) {
            return false;
        }

        // If distance is less then, then dont bother if its Ranged
        // Apply constraint when its over the max length.
        this.direction.subVectors( this.point1.position, this.point2.position );       // Vector Length
        const curLenSqr = this.direction.lengthSq();                 // Len Squared for Quick Checks
        if( Math.abs( curLenSqr - this.lengthSq ) < 0.0001 ||
            ( this.isRanged && curLenSqr <= this.lengthSq ) ) return false;


        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        const stiffness = 1.0;                      // Max Total Ratio
        const curLength    = Math.sqrt( curLenSqr );   // Actual Distance
        const delta     = ( curLength == 0 )? this.length : ( this.length - curLength ) / curLength; // Normalize LenConstraint in relation to current distance of DIR


        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Create A & B Ration of how to divide the moment toward eachother.
        // If a Point is pinned, then the other point gets 100% of the movement
        // else the movement is based on the difference of mass each point represents.
        
        let point1Scale;
        let point2Scale;
        const pin1 = ( this.point1Anchor || this.point1.isPinned );
        const pin2 = ( this.point2Anchor || this.point2.isPinned );
        
        if( pin1 && !pin2 ) {
            point1Scale = 0;
            point2Scale = stiffness; 
        }
        else if( !pin1 && pin2 ) {
            point1Scale = stiffness;
            point2Scale = 0; 
        }
        else {
            // Compute the Weight between the Two Points using its mass
            // 1 - Mass Ratio, this is done so greater mass will have the smaller side of travel scale.
            // So M1 + M3 = M4, M3/M4 = 0.8, dont want the heaver side to handle 80% of the travel distance, 
            // so 1.0 - 0.8 = 0.2, So Mass 3 will do 20% of the difference, while Mass 1 which is lighter moves 80% the diff. 
            point1Scale = ( 1 - this.point1.mass / (this.point1.mass + this.point2.mass) ) * stiffness;
            point2Scale = stiffness - point1Scale;    // Since Stiffness is the Max Weight value, Use that to get the inverse of A's Weight Ratio
        }

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        // Move Points closer or further apoint1rt to reach its ideal distance
        if( !pin1 ){
            //this.point1.position.add( this.v.fromScale( this.direction, point1Scale * delta ) );
            let v = this.direction.clone().multiplyScalar(point1Scale * delta );
            this.point1.position.x += v.x;
            this.point1.position.y += v.y;
            this.point1.position.z += v.z;
        }

        if( !pin2 ){
            //this.point2.position.sub( this.direction.copy( this.direction.multiplyScalar(point2Scale * delta ) );
            let v = this.direction.clone().multiplyScalar( point2Scale * delta );
            this.point2.position.x -= v.x;
            this.point2.position.y -= v.y;
            this.point2.position.z -= v.z;
        }

        return true;
    }
}

export default P4Cage;

const Spine_Mass = 8;
const Biped_Config  = {
    hip         : { mass: 16 },
    head        : { mass: 1 },
    armL_head   : { mass: 4 }, 
    armL_pole   : { mass: 2, pole: true },
    armL_tail   : { mass: 1 },
    armR_head   : { mass: 4 },
    armR_pole   : { mass: 2, pole: true },
    armR_tail   : { mass: 1 },
    legL_head   : { mass: 4 },
    legL_pole   : { mass: 2, pole: true },
    legL_tail   : { mass: 1 },
    legR_head   : { mass: 4 },
    legR_pole   : { mass: 2, pole: true },
    legR_tail   : { mass: 1 },
};

class BipedFBIK {

    constructor( rig ) {
        this.skeleton = new IKSkeleton();
        this.lines = [];
        this.rig = rig;
        this.hip =  new IKPoint();
        this.spinePoints = [];
        this.build( );
    }

    build( ) {
        const t = {};
        for( let k in Biped_Config ){
            t[ k ] = this.skeleton.newPoint( Biped_Config[ k ] );
        }

        this.hip = t.hip;

        // this.armL   = s.newLimbCage( t.armL_head, t.armL_pole, t.armL_tail ).setPrevPole( [0,0,-1] );
        // this.armR   = s.newLimbCage( t.armR_head, t.armR_pole, t.armR_tail ).setPrevPole( [0,0,-1] );
        this.legR   = this.skeleton.newLimbCage( t.legR_head, t.legR_pole, t.legR_tail ).setPrevPole( new THREE.Vector3(0,0,1) );
        this.legL   = this.skeleton.newLimbCage( t.legL_head, t.legL_pole, t.legL_tail ).setPrevPole( new THREE.Vector3(0,0,1) );

        // this.footL  = s.newTriExtCage( t.legL_tail, true );
        // this.footR  = s.newTriExtCage( t.legR_tail, true );

        // this.handL  = s.newTriExtCage( t.armL_tail, false );
        // this.handR  = s.newTriExtCage( t.armR_tail, false );

        // this.head   = s.newTriExtCage( t.head, false );

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        if( this.rig.spine ){
            // Spine Bones
            for( let ikBone of this.rig.spine.bonesInfo ){
                this.spinePoints.push( this.skeleton.newPoint( { mass:Spine_Mass } ) );
            }

            // Spine Tail
            this.spinePoints.push( this.skeleton.newPoint( { mass:Spine_Mass } ) );
            
            // Create a Constraint Cage
            this.hipCage    = this.skeleton.newP4Cage( this.hip, this.spinePoints[ 0 ], t.legR_head, t.legL_head );
            this.chestCage  = this.skeleton.newP4Cage( this.spinePoints[ this.rig.spine.count-1 ], this.spinePoints[ this.rig.spine.count ], t.armR_head, t.armL_head );

            // for( let i=0; i < this.rig.spine.count - 1; i++ ){
            //     this.spineCage.push( this.skeleton.newAxisCage( this.spinePoints[ i ], this.spinePoints[ i+1 ] ) );
            // }

            // this.skeleton.newPoint( this.chestCage.pTail, this.head.pHead );
        }

        // this.defineRenderLines();  // Create lines for Renderer
    }

    defineRenderLines( ) {
        //create a blue LineBasicMaterial
        const material = new THREE.LineBasicMaterial( { color: 0x0000ff, depthTest: false } );

        let points = [ this.hipCage.pHead.position, this.hipCage.pLeft.position ];
        let geometry = new THREE.BufferGeometry().setFromPoints( points );
        this.lines.push(new THREE.Line( geometry, material ))

        points = [ this.hipCage.pHead.position, this.hipCage.pRight.position ];
        geometry = new THREE.BufferGeometry().setFromPoints( points );
        this.lines.push(new THREE.Line( geometry, material ))

        points = [ this.hipCage.pHead.position, this.hipCage.pPole.position ];
        geometry = new THREE.BufferGeometry().setFromPoints( points );
        this.lines.push(new THREE.Line( geometry, material ))

        points = [ this.hipCage.pHead.position, this.hipCage.pTail.position ];
        geometry = new THREE.BufferGeometry().setFromPoints( points );
        this.lines.push(new THREE.Line( geometry, material ))
        // let points = [ this.head.pHead.position, this.head.pPole.position ];
        // points = [ this.head.pHead.position, this.head.pEff.position ];
        // points = [ this.head.pPole.position, this.head.pEff.position ];

    }

    bindPose( pose, resetConstraints = false, debug = false ) {
        const rig = this.rig;

        if( rig.hip ){
            this.hip.setPosition( rig.hip.getStartPosition( pose ) );
            if( this.hipCage ) {
                this.hipCage.updatePole();
            }
        }

        // if( rig.head ){
        //     let p1 = rig.head.getStartPosition( pose );
        //     let p2 = rig.head.getTailPosition( pose )
        //     this.head.pHead.setPosition( p1 );
        //     this.head.setPoleOffset( p1, new THREE.Vector3(0,0,0.2), new THREE.Vector3(0,p2.y-p1.y,0) );
        // }

        if( rig.spine ){
            // Spine Bones           
            for( let i = 0; i < rig.spine.count; i++ ){
                this.spinePoints[ i ].setPosition( rig.spine.getPositionAt( pose, i ) );
            }

            // Spine Tail
            this.spinePoints[ rig.spine.count ].setPosition( rig.spine.getTailPosition( pose ) );
            this.chestCage.updatePole();
            
            // for( let i of this.spineCage ) {
            //     i.updatePole();
            // }
        }

        if( rig.rightLeg ) {
            this._bindLimb( rig.rightLeg, pose, this.legR );
        }
        if( rig.leftLeg ) {
            this._bindLimb( rig.leftLeg, pose, this.legL );
        }

        if( resetConstraints ) {
            this.skeleton.rebindConstraints();
        }
        return this;
    }

    _bindLimb( chain, pose, limb ) {
        limb.pHead.setPosition( chain.getStartPosition( pose ) );
        limb.pPole.setPosition( chain.getMiddlePosition( pose ) );
        limb.pTail.setPosition( chain.getTailPosition( pose ) );
    }

    setPointPosition( idx, position ) {
        this.skeleton.setPosition( idx, position );
        return this;
    }

    resolve( ) {
        this.skeleton.resolve();
        return this;
    }

    resolveForPole( pIndex ) {
        let cage;
        let cage2;
        // if (this.armL.pPole.idx == pIndex) {
        //   cage = this.armL;
        //   cage2 = this.handL;
        // } else if (this.armR.pPole.idx == pIndex) {
        //   cage = this.armR;
        //   cage2 = this.handR;
        // } else if (this.chestCage.pPole.idx == pIndex)
        //   cage = this.chestCage;
        if (this.hipCage.pPole.idx == pIndex)
            cage = this.hipCage;
        // else if (this.legR.pPole.idx == pIndex) {
        //   cage = this.legR;
        //   cage2 = this.footR;
        // } else if (this.legL.pPole.idx == pIndex) {
        //   cage = this.legL;
        //   cage2 = this.footL;
        // } else if (this.head.pPole.idx == pIndex || this.head.pEff.idx == pIndex)
        //   cage = this.head;
        // else if (this.footL.pPole.idx == pIndex || this.footL.pEff.idx == pIndex)
        //   cage = this.footL;
        // else if (this.footR.pPole.idx == pIndex || this.footR.pEff.idx == pIndex)
        //   cage = this.footR;
        // else if (this.handL.pPole.idx == pIndex || this.handL.pEff.idx == pIndex)
        //   cage = this.handL;
        // else if (this.handR.pPole.idx == pIndex || this.handR.pEff.idx == pIndex)
        //   cage = this.handR;
        else {
            for (let c of this.spineCage) {
            if (c.pPole.idx == pIndex) {
                cage = c;
                break;
            }
            }
        }
        if (!cage) {
            console.warn("Can not found Verlet Cage that pole belongs to:", pIndex);
            return this;
        }
        let isDone = false;
        let i = 0;
        cage.poleMode(true);
        do {
            isDone = true;
            if (!cage.resolve())
            isDone = false;
            if (cage2 && !cage2.resolve())
            isDone = false;
            i++;
        } while (!isDone && i < this.skeleton.iterations);
        cage.poleMode(false);
        return this;
    }

    updateRigTargets(){
        const rig = this.rig;
        const effectorDirection = new THREE.Vector3();
        const poleDirection = new THREE.Vector3();

        // HIPS
        this.hipCage.getAxis( effectorDirection, poleDirection );
        if(rig.hip) {
            rig.hip.solver.setTargetDirection( effectorDirection, poleDirection );
            rig.hip.solver.setMovePosition( this.hipCage.getHeadPosition(), true );
        }
        // // HEAD
        // this.head.getAxis( effectorDirection, poleDirection );
        // rig.head?.solver
        //     .setTargetDirection( effectorDirection, poleDirection );


        // // ARMS
        // rig.armL?.solver
        //     .setTargetPosition( this.armL.getTailPosition() )
        //     .setTargetPole( this.armL.getPoleDirection( poleDirection ) );

        // rig.armR?.solver
        //     .setTargetPosition( this.armR.getTailPosition() )
        //     .setTargetPole( this.armR.getPoleDirection( poleDirection ) );

        // this.handL.getAxis( effectorDirection, poleDirection );
        // rig.handL?.solver
        //     .setTargetDirection( effectorDirection, poleDirection );

        // this.handR.getAxis( effectorDirection, poleDirection );
        // rig.handR?.solver
        //     .setTargetDirection( effectorDirection, poleDirection );


        // // LEGS
        // rig.legL?.solver
        //     .setTargetPosition( this.legL.getTailPosition() )
        //     .setTargetPole( this.legL.getPoleDirection( poleDirection ) );

        // rig.legR?.solver
        //     .setTargetPosition( this.legR.getTailPosition() )
        //     .setTargetPole( this.legR.getPoleDirection( poleDirection ) );

        // this.footL.getAxis( effectorDirection, poleDirection );
        // rig.footL?.solver
        //     .setTargetDirection( effectorDirection, poleDirection );

        // this.footR.getAxis( effectorDirection, poleDirection );
        // rig.footR?.solver
        //     .setTargetDirection( effectorDirection, poleDirection );


        // SPINE
        // if( rig.spine ){
        //     const aEff = [];
        //     const aPol = [];

        //     for( let i = 0; i < this.spineCage.length; i++ ){
        //         this.spineCage[ i ].getAxis( poleDirection, effectorDirection );    // Spine has Pole+Eff flipped

        //         aEff.push( effectorDirection.slice( 0 ) );
        //         aPol.push( poleDirection.slice( 0 ) );
        //     }

        //     this.chestCage.getAxis( poleDirection, effectorDirection );
        //     aEff.push( effectorDirection.slice( 0 ) );
        //     aPol.push( poleDirection.slice( 0 ) );

        //     rig.spine.solver.setChainDirection( aEff, aPol );
        // }
    }
}

export { BipedFBIK };

class IKSkeleton {

    constructor( ) {
        this.points = [];           // Skeleton is made of Points Linked by Constraints
        this.constraints = [];      // Constraints Applied to Points
        this.iterations = 5;        // How many times to execute constraints to be fully resolved.
    }    
    
    newPoint( config ) { 
        const point =  new IKPoint( config );
        point.idx = this.points.length;
        this.points.push( point ); 
        return point;
    }

    setPosition( idx, position ){
        const point = this.points[ idx ];
        if( point ){
            point.position.copy(position);
        }
        return this;
    }

    /** Create a Cage around 4 points */
    newP4Cage( pHead, pTail, pRight, pLeft ) {
        const cage = new P4Cage( this, pHead, pTail, pRight, pLeft );
        this.constraints.push( cage );
        return cage;
    }

    /** Create a Cage around two points */
    newAxisCage( pHead, pTail ) {
        const cage = new AxisCage( this, pHead, pTail );
        this.constraints.push( cage );
        return cage;
    }

    /** Link 3 Points in a Chain */
    newLimbCage( pHead, pPole, pTail ) {
        const cage = new LimbCage( this, pHead, pPole, pTail );
        this.constraints.push( cage );
        return cage;
    }

    newTriExtCage( pHead, useEffFromPole=false ) {
        const cage = new TriExtCage( this, pHead, useEffFromPole );
        this.constraints.push( cage );
        return cage;
    }

    /** Basic Distance Constraint */
    newLink( pHead, pTail ) {
        const con = new DistanceConstraint( pHead, pTail );
        this.constraints.push( con );
        return con;
    }

    /** Have constraints reset its values based */
    rebindConstraints( ) {
        for( let c of this.constraints ) {
            c.rebind();
        }
    }

    resolve( ) {

        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        for( let i = 0; i < this.iterations; i++ ){
            let chg = false;
            
            for( let c of this.constraints ){
                if( c.resolve() ) {
                    chg = true;
                }
            }

            if( !chg ) break;  // Nothing has changed, Exit early.
        }
    }
    //#endregion ////////////////////////////////////////////////////

}
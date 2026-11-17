// Three works and an epilogue. All formations are functions of scroll position,
// so reversing the scroll retraces the same path without queued animations.
import * as THREE from '../vendor/three.module.min.js';
import { createMeteorTrail } from './meteor-trail.js';
import { sceneDepth } from './scene-depth.js';
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = THREE.MathUtils.lerp;
const random = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
const TAU = Math.PI * 2;
// Reflect a descending path above the actual floor, allowing a visible rebound.
export function aboveFloor(y,radius) {
  const contact=-510+radius;
  return y<contact?contact+(contact-y)*.65:y;
}
export const END = 6.28;
export const STOPS = [0, 1.22, 2.35, 3.48, 4.61, END];

export function createStory(scene, flock, glow) {
  const bottle = new THREE.Group(); scene.add(bottle);
  // The shell has both an outer and inner wall and an open neck.
  const profile = [[0,-320],[105,-320],[132,-315],[146,-300],[148,-270],[148,135],
    [145,170],[135,200],[115,223],[97,242],[94,276],[108,279],[110,291],
    [105,303],[81,303],[79,288],[81,270],[82,244],[99,216],[122,190],
    [132,160],[134,130],[134,-267],[129,-285],[104,-297],[0,-297]];
  // Pale, color-transmitting glass with sharp reflections and warped star colors.
  const starLights=Array.from({length:9},()=>new THREE.Vector3());
  const glass = new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,
    uniforms:{reveal:{value:0},starLights:{value:starLights}},
    vertexShader:`varying vec3 n,v,q; void main(){vec4 p=modelViewMatrix*vec4(position,1.);
      n=normalize(normalMatrix*normal);v=-p.xyz;q=position;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`uniform float reveal; uniform vec3 starLights[9]; varying vec3 n,v,q;
    void main(){
      vec3 normal=normalize(n), eye=normalize(v);
      float edge=pow(1.-clamp(abs(dot(normal,eye)),0.,1.),2.2);
      vec3 ray=reflect(-eye,normal);
      float panel=(1.-smoothstep(.024,.065,abs(ray.x+.57)))*smoothstep(-.30,.15,ray.y)*(1.-smoothstep(.78,.94,ray.y));
      float glint=exp(-pow((ray.x-.72)/.025,2.))*smoothstep(-.7,.2,ray.y);
      float shoulder=pow(clamp(dot(normal,normalize(vec3(-.62,.65,.8))),0.,1.),75.)*smoothstep(105.,185.,q.y);
      float bottom=1.-smoothstep(-299.,-268.,q.y);
      float mouth=smoothstep(270.,284.,q.y);
      float ring=pow(.5+.5*sin(q.y*.40+ray.x*2.),10.);
      float shine=clamp(panel*.88*smoothstep(35.,160.,q.y)+glint*.38*(1.-smoothstep(-70.,100.,q.y))+shoulder*.95+(bottom+mouth)*ring*(.18+edge*.8),0.,1.);
      vec3 reflected=vec3(0.); float reflection=0.;
      for(int i=0;i<9;i++){
        vec2 offset=vec2(q.x*(1.15+edge*.7)+normal.x*36.,q.y+normal.y*50.);
        offset-=starLights[i].xy*vec2(1.2,.85);
        offset.x+=sin(q.y*.035+float(i))*9.;
        offset/=vec2(22.+edge*20.,30.);
        float angle=atan(offset.y,offset.x);
        float shape=.66+.24*cos(angle*5.+float(i));
        float light=(1.-smoothstep(shape-.09,shape+.05,length(offset)))*(.10+edge*.58);
        vec3 tint=mod(float(i),3.)<1.?vec3(1.,.37,.58):mod(float(i),3.)<2.?vec3(.27,.88,.70):vec3(1.,.77,.30);
        reflected+=tint*light; reflection+=light;
      }
      float glassTint=.008+edge*.28+(bottom+mouth)*(.07+(1.-ring)*.12);
      vec3 tint=mix(vec3(.64,.88,.81),vec3(.98,.70,.80),smoothstep(-.65,.65,ray.x));
      tint=mix(tint,vec3(1.,.90,.64),smoothstep(.15,.85,ray.y)*.60);
      float alpha=clamp(glassTint+shine*.78+reflection*.5,0.,.82);
      vec3 color=(tint*glassTint+vec3(1.,.99,.94)*shine*.78+reflected*.65)/max(.01,glassTint+shine*.78+reflection*.5);
      gl_FragColor=vec4(color,alpha*reveal*(gl_FrontFacing?1.:.25));
    }`});
  const shell = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x,y]) => new THREE.Vector2(x,y)),64), glass);
  shell.renderOrder = 3; bottle.add(shell);
  const rimGeometry=new THREE.TorusGeometry(94,8,12,72);
  rimGeometry.rotateX(Math.PI/2); rimGeometry.translate(0,292,0);
  const rim = new THREE.Mesh(rimGeometry,glass); rim.renderOrder=3; bottle.add(rim);
  const corkCanvas=document.createElement('canvas'); corkCanvas.width=corkCanvas.height=256;
  const c=corkCanvas.getContext('2d'); c.fillStyle='#dcb774'; c.fillRect(0,0,256,256);
  for(let i=0;i<2000;i++) { c.fillStyle=i%4===0?'#8c754e':'#ecd09a'; c.globalAlpha=.12+random(i+10)*.35;
    c.beginPath(); c.ellipse(random(i)*256,random(i+8)*256,.4+random(i+12)*2,.5+random(i+14)*2,0,0,TAU); c.fill(); }
  const corkTexture=new THREE.CanvasTexture(corkCanvas); corkTexture.colorSpace=THREE.SRGBColorSpace;
  const cork=new THREE.Mesh(new THREE.CylinderGeometry(100,80,76,48),new THREE.MeshStandardMaterial({map:corkTexture,roughness:.92,transparent:true}));
  bottle.add(cork);
  const ambient=new THREE.HemisphereLight('#fff5dc','#b2b89a',2.1); scene.add(ambient);
  const key=new THREE.DirectionalLight('#fff1d0',2.6); key.position.set(-800,1800,1200); scene.add(key);
  // Small, solid stars fill the crown, with a denser spiral climbing through it.
  // Reuse their geometry and palette, with one additional instanced draw call.
  const fillGeometry=flock.geometry.clone();
  const fillCells=new Float32Array(1200*2), fillSeeds=new Float32Array(1200);
  const fillStars=Array.from({length:1200},(_,i)=>{
    const cell=(i%3)*5+Math.floor(random(i+8701)*5);
    fillCells[i*2]=cell%4; fillCells[i*2+1]=3-Math.floor(cell/4); fillSeeds[i]=random(i+8811);
    return {height:random(i+8101),angle:random(i+8201)*TAU,
      radius:random(i+8301),size:random(i+8401),phase:random(i+8501)*TAU};
  });
  fillGeometry.setAttribute('aCell',new THREE.InstancedBufferAttribute(fillCells,2));
  fillGeometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(fillSeeds,1));
  const treeFill=new THREE.InstancedMesh(fillGeometry,flock.material,1200);
  treeFill.name='tree-small-stars'; treeFill.frustumCulled=false; treeFill.visible=false;
  treeFill.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(treeFill);
  const endingDust=new THREE.InstancedMesh(fillGeometry,flock.material,360);
  endingDust.name='ending-small-stars'; endingDust.frustumCulled=false; endingDust.visible=false;
  endingDust.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(endingDust);
  const endingFloat=new THREE.InstancedMesh(fillGeometry,flock.material,96);
  endingFloat.name='ending-floating-stars'; endingFloat.frustumCulled=false; endingFloat.visible=false;
  endingFloat.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(endingFloat);
  const starRadius=flock.geometry.boundingSphere?.radius||45;
  const meteor=createMeteorTrail(scene);
  const point=new THREE.Vector3(), start=new THREE.Vector3(), end=new THREE.Vector3(), neck=new THREE.Vector3();
  const projected=new THREE.Vector3(), right=new THREE.Vector3(), up=new THREE.Vector3(), anchor=new THREE.Vector3();
  const matrix=new THREE.Matrix4(), object=new THREE.Object3D();
  const impulses=Array.from({length:flock.instanceMatrix.count},()=>({x:0,y:0,vx:0,vy:0,spin:0,angle:0}));
  const endingImpulses=Array.from({length:endingFloat.instanceMatrix.count},()=>({x:0,y:0,vx:0,vy:0,spin:0,angle:0}));
  const cardNodes=[...document.querySelectorAll('.work-slot')];
  const labelNodes=[...document.querySelectorAll('.work-label')];
  const guideWorks=cardNodes.map(()=>new THREE.Vector3()), guideMouth=new THREE.Vector3();
  let guideWidth=0, guideHeight=0, workSizes=[];
  const bottleRay=new THREE.Raycaster(), localRay=new THREE.Ray(), bottleInverse=new THREE.Matrix4();
  const bottleBounds=new THREE.Box3(new THREE.Vector3(-150,-320,-150),new THREE.Vector3(150,380,150));
  const bottleHit=new THREE.Vector3(), bottlePointer=new THREE.Vector2();
  const shake={roll:0,pitch:0,vr:0,vp:0,x:0,z:0,vx:0,vz:0};
  let lastBottlePointerAt=0;
  let treeMix=0, bottleMix=0;

  function scatter(i,t,third,halfW,halfH,p) {
    const r=Array.from({length:6},(_,j)=>random(i*7+j+47));
    const near=i%12===1, far=i%12>=8;
    const baseDistance=near?1150+r[2]*900:far?4400+r[2]*3600:1900+r[2]*2400;
    const travel=p-(third?2.48:.22);
    const distance=Math.max(180,baseDistance-travel*1300);
    // Keep lateral positions at their reference depth: advancing now creates
    // real radial parallax instead of cancelling it with distance compensation.
    const k=baseDistance/1800;
    let x=.08+r[0]*1.22, y=(r[1]-.5)*2.10;
    const speed=far?.07:near?.24:.14;
    x+=Math.sin(t*(speed+r[4]*.10)+r[3]*TAU)*(far?.045:.15);
    y+=Math.cos(t*(speed+r[5]*.12)+r[4]*TAU)*(far?.035:.13);
    if(third) { x+=Math.sin(t*.24+r[2]*TAU)*.12; y+=Math.sin(t*.18+r[0]*TAU)*.10; }
    if(i%6===0) x=-1.02+r[0]*.14+Math.sin(t*.25+i)*.06;
    if(i%9===0) { x=-.9+r[0]*1.8; y=(r[1]>.5?1:-1)*(.90+r[1]*.30); }
    // Only a few foreground stars skim the edges, leaving the artwork readable.
    if(near) {
      x=(Math.floor(i/12)%2?1:-1)*(.78+r[0]*.24)+Math.sin(t*.31+r[3]*TAU)*.055;
      y=(r[1]-.5)*1.7+Math.sin(t*.27+r[4]*TAU)*.09;
    }
    return point.set(x*halfW*k, y*halfH*k, -distance);
  }
  function treeSpiral(u,angleOffset,shell,lift,t,halfW,halfH,mobile) {
    const h=mobile?halfH*.84:Math.min(780,halfH*1.35), bottom=mobile?-halfH*.65:-h*.47;
    // A continuous accent band climbs through a filled crown over 3.75 turns.
    // Full-angle offsets distribute the remaining stars around the whole tree.
    const angle=u*TAU*3.75+.55+angleOffset+Math.sin(t*.14)*.035;
    const radius=(1-u)*h*.43*shell, center=mobile?0:-halfW*.47;
    return point.set(center+Math.cos(angle)*radius,
      bottom+u*h+Math.sin(angle)*radius*.14+lift*h,
      -1800+Math.sin(angle)*radius*.52);
  }
  function tree(i,count,t,halfW,halfH,mobile) {
    // Thirteen steps rotate through the existing three color families.
    const large=i>0&&(i-1)%13===0;
    let u=i===0?1:1-Math.pow((i-.5)/(count-1),.57);
    if(large) u=.93-Math.pow(((i-1)/13+.25)/Math.ceil((count-1)/13),.58)*.91;
    const angleOffset=(random(i+205)-.5)*(large?.30:TAU);
    const shell=large?.88+random(i+33)*.18:.20+Math.sqrt(random(i+33))*.85;
    const lift=i===0?0:(random(i+51)-.5)*.035+Math.sin(t*.65+i)*.002;
    return treeSpiral(u,angleOffset,shell,lift,t,halfW,halfH,mobile);
  }
  function inBottle(i,t) {
    const r=random(i+153), angle=i*2.399963;
    // Interior stops below the shoulders; star tips have clearance from the shell.
    const radius=Math.sqrt(r)*101;
    const follow=.45+random(i+981)*.70;
    point.set(Math.cos(angle)*radius+shake.x*follow,
      -270+random(i+519)*402+Math.sin(t*.6+i)*1.3+Math.sin(i*1.7)*Math.hypot(shake.x,shake.z)*.55,
      Math.sin(angle)*radius+shake.z*follow);
    // Keep every star's tips inside the cylinder even at maximum shake.
    point.y=THREE.MathUtils.clamp(point.y,-276,137);
    const radial=Math.hypot(point.x,point.z);
    if(radial>112) { point.x*=112/radial; point.z*=112/radial; }
    return point;
  }
  function applyStarHover(impulse,freedom,camera,pointer,dt,viewport) {
    projected.copy(object.position).project(camera);
    const dx=(projected.x*.5+.5)*viewport.width-(pointer.x??-9999);
    const dy=(-projected.y*.5+.5)*viewport.height-(pointer.y??-9999), d2=dx*dx+dy*dy;
    if(dt>0 && projected.z<1 && d2<25600 && freedom>.05) {
      const force=(1-d2/25600)*freedom, inv=1/Math.sqrt(d2+1);
      impulse.vx+=((pointer.vx||0)*.85+dx*inv*1050)*force*dt;
      impulse.vy+=((pointer.vy||0)*.85+dy*inv*1050)*force*dt;
      impulse.spin+=(Math.abs(pointer.vx||0)+Math.abs(pointer.vy||0))*.004*force*dt;
    }
    impulse.vx+=(-impulse.x*4-impulse.vx*2.2)*dt;
    impulse.vy+=(-impulse.y*4-impulse.vy*2.2)*dt;
    impulse.x+=impulse.vx*dt; impulse.y+=impulse.vy*dt;
    impulse.spin*=Math.exp(-dt*1.2); impulse.angle+=impulse.spin*dt*8;
    const viewDepth=Math.max(80,-projected.copy(object.position).applyMatrix4(camera.matrixWorldInverse).z);
    const pixel=2*viewDepth*Math.tan(20*Math.PI/180)/viewport.height;
    object.position.addScaledVector(right,impulse.x*pixel*freedom).addScaledVector(up,-impulse.y*pixel*freedom);
    object.rotation.x+=impulse.angle*freedom; object.rotation.y+=impulse.angle*.6*freedom;
  }
  function update(journey,t,camera,pointer = {mx:0,my:0},dt=0,viewport={width:1440,height:900}) {
    const p=Math.max(0,journey-1), mobile=camera.aspect<.9;
    const halfH=1800*Math.tan(20*Math.PI/180), halfW=halfH*camera.aspect;
    if(guideWidth!==viewport.width||guideHeight!==viewport.height) {
      guideWidth=viewport.width; guideHeight=viewport.height;
      workSizes=cardNodes.map(node=>({width:node.offsetWidth||viewport.width*.27}));
    }
    const enter=smooth(p/.22), gather=smooth((p-.36)/.86), release=smooth((p-1.52)/.88);
    // Story lighting begins after the original glass entrance, preserving its material.
    ambient.intensity=2.1*enter; key.intensity=2.6*enter;
    treeMix=gather*(1-release); bottleMix=smooth((p-4.31)/.87);
    const reveal=smooth((p-4.11)/.31), settle=smooth((p-5.16)/.12);
    const contactStacked=viewport.width<=900||mobile;
    const bottleScale=contactStacked?.62:1.23;
    bottle.visible=reveal>0;
    bottle.position.set(camera.position.x+(contactStacked?halfW*.18:halfW*.51),
      camera.position.y+(contactStacked?-halfH*.42:-halfH*.02),camera.position.z-1800);
    bottle.scale.setScalar(bottleScale*(.82+.18*reveal));
    glass.uniforms.reveal.value=reveal; cork.material.opacity=reveal;
    cork.position.set(0,338+(1-settle)*145,0); cork.rotation.z=(1-settle)*-.11;
    if(settle<.999||viewport.reducedMotion) {
      for(const key of Object.keys(shake)) shake[key]=0;
    } else if(dt>0) {
      // Hit-test the tilted bottle itself, not the entire right half of the screen.
      if(pointer.at && pointer.at!==lastBottlePointerAt) {
        bottlePointer.set((pointer.x??-9999)/viewport.width*2-1,1-(pointer.y??-9999)/viewport.height*2);
        bottleRay.setFromCamera(bottlePointer,camera);
        bottleInverse.copy(bottle.matrixWorld).invert();
        localRay.copy(bottleRay.ray).applyMatrix4(bottleInverse);
        if(localRay.intersectBox(bottleBounds,bottleHit)) {
          shake.vr+=THREE.MathUtils.clamp(-(pointer.vx||0)/240,-16,16)*dt;
          shake.vp+=THREE.MathUtils.clamp((pointer.vy||0)/320,-12,12)*dt;
        }
      }
      // Small integration steps keep rapid repeated passes stable across frame rates.
      const steps=Math.ceil(Math.min(dt,.05)*120), h=Math.min(dt,.05)/steps;
      for(let step=0;step<steps;step++) {
        shake.vr+=(-shake.roll*24-shake.vr*3.8)*h;
        shake.vp+=(-shake.pitch*26-shake.vp*4)*h;
        shake.vr=THREE.MathUtils.clamp(shake.vr,-3.2,3.2);
        shake.vp=THREE.MathUtils.clamp(shake.vp,-2.6,2.6);
        shake.roll=THREE.MathUtils.clamp(shake.roll+shake.vr*h,-.60,.60);
        shake.pitch=THREE.MathUtils.clamp(shake.pitch+shake.vp*h,-.42,.42);
        // The contents lag behind the glass, then overshoot and settle separately.
        shake.vx+=((-shake.roll*110-shake.vr*22-shake.x)*16-shake.vx*3.2)*h;
        shake.vz+=((shake.pitch*110+shake.vp*22-shake.z)*16-shake.vz*3.2)*h;
        shake.x=THREE.MathUtils.clamp(shake.x+shake.vx*h,-58,58);
        shake.z=THREE.MathUtils.clamp(shake.z+shake.vz*h,-58,58);
      }
    }
    lastBottlePointerAt=pointer.at||0;
    bottle.rotation.set(shake.pitch,Math.sin(t*.2)*.045,-.14*settle+shake.roll);
    bottle.updateMatrixWorld(true);
    for(let i=0;i<starLights.length;i++) starLights[i].copy(inBottle(i*19,t));
    right.setFromMatrixColumn(camera.matrixWorld,0); up.setFromMatrixColumn(camera.matrixWorld,1);
    const count=Math.min(flock.count,Math.min(viewport.width,viewport.height)<700?150:270);
    for(let i=0;i<count;i++) {
      flock.getMatrixAt(i,matrix); matrix.decompose(object.position,object.quaternion,object.scale);
      const originalScale=object.scale.x;
      const gatherStar=smooth((p-.36-random(i+303)*.22)/.64);
      const releaseStar=smooth((p-1.52-random(i+409)*.25)/.63);
      const formation=gatherStar*(1-releaseStar);
      start.copy(scatter(i,t,false,halfW,halfH,p));
      end.copy(tree(i,count,t,halfW,halfH,mobile));
      start.lerp(end,gatherStar);
      const curl=Math.sin(Math.PI*gatherStar)*(1-releaseStar);
      start.x+=Math.sin(i*2.4+gatherStar*TAU)*180*curl;
      start.y+=Math.sin(i+gatherStar*Math.PI)*120*curl;
      start.z+=Math.cos(i*2.4+gatherStar*TAU)*210*curl;
      end.copy(scatter(i,t,true,halfW,halfH,p)); start.lerp(end,releaseStar);
      const unfurl=Math.sin(Math.PI*releaseStar);
      start.x+=Math.cos(i*2.4+releaseStar*Math.PI)*160*unfurl;
      start.y+=Math.sin(i*2.4)*130*unfurl;
      start.z+=Math.sin(i+releaseStar*Math.PI)*260*unfurl;
      if(mobile && formation<1) start.y-=halfH*.32*(1-formation);
      start.add(camera.position);
      // One quarter remain outside, distributed across three depth layers.
      const outside=i%4===3;
      if(outside) {
        const layer=Math.floor(i/4)%23;
        const distance=layer===0?780+random(i+921)*180:layer<3?2800+random(i+921)*1000:4800+random(i+921)*1800;
        let x=(random(i+922)-.5)*2.15, y=(random(i+923)-.5)*2.0;
        if(layer!==0) { x=-.40+(random(i+922)-.5)*1.65; y=.10+random(i+923)*.75; }
        if(layer===0) { x=(x<0?-1:1)*(1.00+random(i+925)*.08); y=(random(i+923)-.5)*1.6; }
        // Keep the contact text readable while stars occupy the surrounding space.
        if(contactStacked && y>.12 && Math.abs(x)<.87) x=(x<0?-1:1)*.94;
        else if(!contactStacked && x<.05 && Math.abs(y)<.40) y=(y<0?-1:1)*(.50+random(i+924)*.35);
        x+=Math.sin(t*.16+i)*.045; y+=Math.cos(t*.13+i)*.05;
        end.set(x*halfW*distance/1800,y*halfH*distance/1800,-distance).add(camera.position);
        start.lerp(end,bottleMix);
      }
      const local=outside?0:clamp((p-4.31-random(i+817)*.35)/.52);
      if(local>0) {
        // Each star reaches the open neck before descending to its own interior point.
        neck.set(0,380,0).applyMatrix4(bottle.matrixWorld);
        end.copy(inBottle(i,t)).applyMatrix4(bottle.matrixWorld);
        if(local<.66) {
          // A sweeping, narrowing orbit gathers above the opening, not through a wall.
          const q=smooth(local/.66), a=i*2.399963+q*TAU*1.25;
          const orbit=Math.sin(q*Math.PI)*170;
          start.lerp(neck,q); start.x+=Math.cos(a)*orbit;
          start.z+=Math.sin(a)*orbit; start.y+=Math.sin(q*Math.PI)*380;
        } else {
          const q=smooth((local-.66)/.34);
          start.copy(neck).lerp(end,q);
          start.x+=Math.sin(q*TAU+i)*Math.sin(q*Math.PI)*16;
          start.z+=Math.cos(q*TAU+i)*Math.sin(q*Math.PI)*16;
        }
      }
      object.position.lerp(start,enter);
      const r=random(i+612);
      const flying=i%12===1?1.0+r*.6:i%12>=8?.55+r*.45:.65+r*.72;
      const tier=(i-1)%13;
      const treeSize=(i===0?1.70:tier===0?.90+r*.43:tier<3?.36+r*.24:.16+Math.pow(r,1.2)*.18)*(mobile?.57:1);
      const bottleSize=.23+r*.13;
      let size=mix(flying,treeSize,formation);
      size=mix(size,bottleSize,smooth(local/.45));
      object.scale.setScalar(mix(originalScale,size,enter));
      if(enter>.001) {
        const angle=t*(.12+r*.23)+i*.7;
        const calm=Math.max(formation,local);
        object.rotation.set(mix(angle,.10+Math.sin(i)*.28,calm),mix(angle*(.45+random(i+613)*.8)+Math.sin(t*.6+i)*.16,Math.sin(i*4)*.5,calm),
          mix(angle*.25,Math.sin(i*7)*.48,calm));
        if(local===1) {
          object.rotation.x+=shake.z*.025;
          object.rotation.z+=shake.x*.025;
          object.quaternion.premultiply(bottle.quaternion);
        }
      }
      // Apply the original screen-space spring AFTER the formation positions.
      // The previous version overwrote this interaction with its layout matrices.
      const impulse=impulses[i], freedom=enter*(1-formation*.9)*(1-smooth(local/.5));
      applyStarHover(impulse,freedom,camera,pointer,dt,viewport);
      if(enter>.999 && local===0 && formation<.01) {
        object.position.y=aboveFloor(object.position.y,starRadius*object.scale.x);
      }
      object.updateMatrix(); flock.setMatrixAt(i,object.matrix);
    }
    // Keep the homepage's original 540/240 stars, fading only the additional
    // entrance stars as the 270/150 story stars take over. No count discontinuity.
    for(let i=count;i<flock.count;i++) {
      flock.getMatrixAt(i,matrix); matrix.decompose(object.position,object.quaternion,object.scale);
      object.scale.multiplyScalar(Math.max(.00001,1-enter)); object.updateMatrix(); flock.setMatrixAt(i,object.matrix);
    }
    flock.instanceMatrix.needsUpdate=true; glow.count=flock.count;
    treeFill.visible=p>.36&&p<2.40;
    if(treeFill.visible) {
      treeFill.count=Math.min(viewport.width,viewport.height)<700?900:1200;
      const center=mobile?0:-halfW*.47;
      for(let i=0;i<treeFill.count;i++) {
        const star=fillStars[i], u=1-Math.pow((i+.5)/treeFill.count,.57);
        // Three quarters fill the entire crown; one quarter emphasizes the
        // ascending spiral. The spaces between turns remain populated.
        const band=i%4===0;
        const angleOffset=(star.angle/TAU-.5)*(band?.85:TAU);
        const shell=band?.78+star.radius*.28:.12+Math.sqrt(star.radius)*.92;
        const lift=(star.height-.5)*(band?.070:.035)+Math.sin(t*.6+star.phase)*.002;
        start.copy(treeSpiral(u,angleOffset,shell,lift,t,halfW,halfH,mobile));
        const gatherStar=smooth((p-.36-random(i+8901)*.20)/.66);
        const releaseStar=smooth((p-1.52-random(i+9001)*.22)/.66);
        const formation=gatherStar*(1-releaseStar);
        const drift=1-formation, turn=drift*(1.2+star.size)*Math.PI;
        const x=start.x-center, z=(start.z+1800)/.52;
        const orbit=u*TAU*3.75+.55+angleOffset+turn;
        const spread=drift*(130+star.radius*340);
        object.position.set(center+x*Math.cos(turn)-z*Math.sin(turn)+Math.cos(orbit)*spread,
          start.y+drift*Math.sin(star.phase)*230,
          -1800+(x*Math.sin(turn)+z*Math.cos(turn))*.52+Math.sin(orbit)*spread*.48-drift*300).add(camera.position);
        object.rotation.set(Math.sin(star.phase)*.22,Math.cos(star.phase)*.35,star.angle+Math.sin(t*.25+star.phase)*.05);
        object.scale.setScalar((.13+Math.pow(star.size,1.35)*.17)*(mobile?.67:1)*formation);
        object.updateMatrix(); treeFill.setMatrixAt(i,object.matrix);
      }
      treeFill.instanceMatrix.needsUpdate=true;
    }
    // Fine colored stars fill the depth between a few edge foreground stars and the bottle.
    endingDust.visible=bottleMix>0;
    if(endingDust.visible) {
      endingDust.count=contactStacked?100:170;
      for(let i=0;i<endingDust.count;i++) {
        const near=false, depth=4000+random(i+702)*3000;
        let x=(random(i+703)-.5)*2.2, y=(random(i+704)-.5)*2;
        x+=Math.sin(t*(near?.10:.04)+i)*.025; y+=Math.cos(t*.05+i)*.025;
        const overText=contactStacked?y>.10&&Math.abs(x)<.86:x<.04&&x>-.88&&Math.abs(y)<.44;
        object.position.set(x*halfW*depth/1800,y*halfH*depth/1800,-depth).add(camera.position);
        object.rotation.set(i*.9+t*.12,i*.7+t*.09,i*.4);
        object.scale.setScalar((near?.09+random(i+705)*.10:.09+random(i+705)*.20)*bottleMix*(overText?.28:1));
        object.position.y=aboveFloor(object.position.y,starRadius*object.scale.x);
        object.updateMatrix(); endingDust.setMatrixAt(i,object.matrix);
      }
      endingDust.instanceMatrix.needsUpdate=true;
    }
    endingFloat.visible=bottleMix>0;
    if(endingFloat.visible) {
      const backgroundCount=contactStacked?12:20;
      endingFloat.count=backgroundCount+4;
      const foreground=[[-.86,-.69,720,1.65],[.83,-.82,980,1.48],[-.42,-.86,1330,1.32],[.96,-.40,1650,1.45]];
      for(let i=0;i<endingFloat.count;i++) {
        const edge=i>=backgroundCount, near=i<2;
        const depth=edge?foreground[i-backgroundCount][2]:near?1100+random(i+1201)*400:4200+random(i+1202)*2400;
        let x=-.35+(random(i+1203)-.5)*1.75, y=.15+random(i+1204)*.70;
        if(near) x=(x<0?-1:1)*(.70+random(i+1205)*.36);
        const textArea=contactStacked?y>.10&&Math.abs(x)<.9:x<.08&&x>-.92&&Math.abs(y)<.48;
        if(textArea) {
          y=-.58-random(i+1206)*.32;
          x=contactStacked?(i%2?-1.04:1.04):i%2?-1.03:.10+random(i+1208)*.18;
        }
        if(edge) {
          [x,y]=foreground[i-backgroundCount];
          y+=Math.sin(t*.18+i)*.025;
        }
        x+=Math.sin(t*.12+i)*.04;
        object.position.set(x*halfW*depth/1800,y*halfH*depth/1800,-depth).add(camera.position);
        object.rotation.set(edge?Math.sin(t*.18+i)*.30:i+t*.21,edge?Math.cos(t*.15+i)*.40:i*.7+t*.16,i*.3+t*.08);
        object.scale.setScalar((edge?foreground[i-backgroundCount][3]*(contactStacked?.5:1):near?.55+random(i+1207)*.45:.70+random(i+1207)*.65)*bottleMix);
        const radius=starRadius*object.scale.x;
        object.position.y=Math.max(object.position.y,-510+radius+24)+Math.sin(t*.7+i)*(edge?12:80);
        applyStarHover(endingImpulses[i],viewport.reducedMotion?0:bottleMix,camera,pointer,dt,viewport);
        object.position.y=aboveFloor(object.position.y,radius);
        object.updateMatrix(); endingFloat.setMatrixAt(i,object.matrix);
      }
      endingFloat.instanceMatrix.needsUpdate=true;
    }
    const centers=[.22,1.35,2.48,3.61];
    // Share the actual work layout with the guide rather than keeping a second
    // hard-coded left/right route. Guide waypoints use each work's reading stop.
    const placeWork=(i,d)=>{
      const {distance}=sceneDepth(d);
      const lateral=mobile?.08:mix(.10,.30,smooth((d+.95)/.95));
      anchor.set(camera.position.x+(i%2===1?1:-1)*halfW*lateral*1050/1800,
        camera.position.y+(mobile?halfH*.50:halfH*.02)*1050/1800,camera.position.z-distance);
      return anchor.project(camera);
    };
    const readingEdges=cardNodes.map((node,i)=>(placeWork(i,0).x+1)*viewport.width/2+workSizes[i].width/2);
    cardNodes.forEach((node,i)=>{
      const d=p-centers[i];
      // DepthGallery's essential behavior: fixed planes, advancing camera and
      // overlapping opacity envelopes. Perspective expands the departing plane.
      const plane=sceneDepth(d);
      const scale=plane.scale, opacity=plane.opacity*enter;
      placeWork(i,d);
      node.style.zIndex=String(centers.length-i);
      node.style.opacity=opacity;
      node.style.transform=`translate(-50%,-50%) translate3d(${anchor.x*viewport.width/2}px,${-anchor.y*viewport.height/2}px,0) scale(${scale})`;
      node.style.visibility=opacity<.001?'hidden':'visible';
      node.setAttribute('aria-hidden',String(opacity<.5));
      const label=labelNodes[i];
      if(label) {
        // Sit each caption just right of its own artwork, clamped to the frame so
        // a right-hand work never pushes its number off-screen.
        const labelW=label.offsetWidth||110;
        const baseLeft=viewport.width*.94-labelW;
        // Anchor to the artwork's real painted edge; landscape clips are wider
        // than the portrait boards the layout was measured on.
        const art=node.querySelector('.work-art')||node;
        const paintedRight=art.getBoundingClientRect().right;
        const targetLeft=THREE.MathUtils.clamp(paintedRight+34,16,viewport.width-labelW-20);
        const offset=targetLeft-baseLeft;
        label.style.opacity=opacity;
        label.style.visibility=opacity<.001?'hidden':'visible';
        // Keep small type; a vertical depth offset separates overlapping captions.
        label.style.transform=`translate(${offset}px,calc(-50% - ${d*(mobile?96:140)}px))`;
        label.setAttribute('aria-hidden',String(opacity<.5));
      }
      guideWorks[i].copy(placeWork(i,0));
      guideWorks[i].x=THREE.MathUtils.clamp(guideWorks[i].x+(i%2===1?1:-1)*(workSizes[i].width/viewport.width+48/viewport.width),-.90,.90);
      guideWorks[i].y=THREE.MathUtils.clamp(guideWorks[i].y+(i%2===1?.12:-.10),-.65,.68);
    });
    guideMouth.set(0,292,0).applyMatrix4(bottle.matrixWorld).project(camera);
    meteor.update(journey,t,camera,pointer,dt,{works:guideWorks,mouth:guideMouth,viewport});
    const current=journey<.85?0:p<.8?1:p<1.9?2:p<3.05?3:p<4.18?4:5;
    document.body.dataset.chapter=String(current);
    return {p,treeMix,bottleMix,current};
  }
  return {update,bottle};
}

// Head sampling / reversal reset follow DepthGallery's TrailController and Trail:
// https://github.com/houmahani/codrops-depth-gallery/tree/main/src/Experience
// This version also ages out old samples, so stopping never leaves a static route.
import * as THREE from '../vendor/three.module.min.js';
const clamp=(v)=>Math.max(0,Math.min(1,v));
const smooth=(v)=>{v=clamp(v);return v*v*(3-2*v);};
const random=(n)=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v);};

export function createMeteorTrail(scene) {
  const group=new THREE.Group(); group.name='journey-meteor'; group.renderOrder=10; scene.add(group);
  // Match the reference's foreground trail so floor/star depth cannot hide the guide.
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,
    uniforms:{opacity:{value:0}},
    vertexShader:`varying float along; void main(){along=uv.x;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float opacity; varying float along; void main(){
      vec3 color=mix(vec3(.91,.81,.59),vec3(1.,.99,.90),along);
      gl_FragColor=vec4(color,opacity*smoothstep(0.,.30,along)*mix(.26,.92,along));}`});
  const trail=new THREE.Mesh(new THREE.BufferGeometry(),material);
  trail.name='meteor-history-trail'; trail.frustumCulled=false; group.add(trail);
  const headMaterial=new THREE.MeshBasicMaterial({color:'#fffcec',transparent:true,depthWrite:false,depthTest:false});
  const head=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),headMaterial);
  head.name='meteor-head'; head.scale.setScalar(7); group.add(head);
  const haloMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,
    uniforms:{opacity:{value:0}},
    vertexShader:`varying vec2 p;void main(){p=uv*2.-1.;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 p;uniform float opacity;void main(){
      float r=length(p);gl_FragColor=vec4(1.,.96,.77,exp(-r*r*5.)*(1.-smoothstep(.65,1.,r))*opacity);}`});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(56,56),haloMaterial); group.add(halo);
  // Like TrailHeadParticles: a small recycled pool, short life and drag; birth
  // positions stay in world space instead of sliding along a complete curve.
  const sparkGeometry=new THREE.PlaneGeometry(2,2);
  const sparkMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,
    uniforms:{opacity:{value:0}},
    vertexShader:`varying vec2 p;void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 p;uniform float opacity;void main(){
      float r=length(p),core=exp(-r*r*22.);
      float rays=pow(max(0.,1.-abs(p.x)),9.)*pow(max(0.,1.-abs(p.y)),2.)
        +pow(max(0.,1.-abs(p.y)),9.)*pow(max(0.,1.-abs(p.x)),2.);
      float a=min(1.,core+rays*.48)*(1.-smoothstep(.65,1.,r));
      gl_FragColor=vec4(1.,.98,.87,a*opacity);}`});
  const sparks=Array.from({length:40},()=>{
    const mesh=new THREE.Mesh(sparkGeometry,sparkMaterial.clone());
    mesh.name='meteor-spark'; mesh.visible=false; group.add(mesh); return {mesh,velocity:new THREE.Vector3(),life:0,total:0,phase:0,size:1};
  });
  const samples=[], target=new THREE.Vector3(), tip=new THREE.Vector3(), previousTip=new THREE.Vector3();
  const tangent=new THREE.Vector3(), normal=new THREE.Vector3(), binormal=new THREE.Vector3(), axis=new THREE.Vector3(0,0,1);
  const routePoints=Array.from({length:11},()=>new THREE.Vector3());
  const route=new THREE.CatmullRomCurve3(routePoints,false,'centripetal');
  const stops=[0,.22,.78,1.35,1.91,2.48,3.04,3.61,4.17,4.73,5.19];
  let previousProgress=null, previousDirection=0, clock=0, spawn=0, nextSpark=0, serial=0, initialized=false;
  let previousAspect=null;

  function clear() {
    samples.length=0; trail.visible=false; spawn=0;
    sparks.forEach(s=>{s.life=0;s.mesh.visible=false;});
  }
  function rebuild() {
    trail.visible=samples.length>1;
    if(!trail.visible) return;
    const curve=new THREE.CatmullRomCurve3(samples.map(s=>s.point),false,'centripetal');
    const segments=Math.min(96,Math.max(16,samples.length*2)), sides=6;
    const positions=[],uvs=[],indices=[],points=curve.getPoints(segments);
    for(let i=0;i<=segments;i++) {
      const u=i/segments, radius=.22+Math.pow(u,1.35)*2.65;
      curve.getTangent(u,tangent); normal.crossVectors(axis,tangent).normalize();
      if(normal.lengthSq()<.001) normal.set(1,0,0);
      binormal.crossVectors(tangent,normal).normalize();
      for(let j=0;j<=sides;j++) {
        const a=j/sides*Math.PI*2,c=Math.cos(a)*radius,s=Math.sin(a)*radius;
        positions.push(points[i].x+normal.x*c+binormal.x*s,points[i].y+normal.y*c+binormal.y*s,points[i].z+normal.z*c+binormal.z*s);
        uvs.push(u,j/sides);
        if(i<segments && j<sides) {const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
      }
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices);
    trail.geometry.dispose(); trail.geometry=geometry;
  }
  function update(journey,time,camera,pointer,dt,layout) {
    const p=Math.max(0,journey-1), mobile=camera.aspect<.9;
    const delta=previousProgress===null?0:p-previousProgress;
    const direction=Math.abs(delta)>.00006?Math.sign(delta):0;
    const reverse=direction!==0 && previousDirection!==0 && direction!==previousDirection;
    const active=smooth((journey-.84)/.30)*(1-smooth((p-5.11)/.17));
    const halfH=1800*Math.tan(20*Math.PI/180), halfW=halfH*camera.aspect;
    // Alternate side passes with high/low turns, so the guide wraps around the
    // work sequence instead of connecting all three bottom edges.
    routePoints[0].set(.65,mobile?.12:-.38,0);
    for(let i=0;i<layout.works.length;i++)routePoints[1+i*2].set(layout.works[i].x,layout.works[i].y,0);
    routePoints[2].set(.02,mobile?.86:.74,0);
    routePoints[4].set(-.02,mobile?-.12:-.62,0);
    routePoints[6].set(-.06,mobile?.30:.65,0);
    routePoints[8].set(-.10,mobile?.18:.52,0);
    routePoints[9].set(Math.min(.84,layout.mouth.x+.20),Math.min(.82,layout.mouth.y+.18),0);
    routePoints[10].set(layout.mouth.x,layout.mouth.y,0);
    let segment=0;while(segment<stops.length-2&&p>stops[segment+1])segment++;
    const u=(segment+clamp((p-stops[segment])/(stops[segment+1]-stops[segment])))/(stops.length-1);
    route.getPoint(u,target);
    const phase=(p-.22)/1.13*Math.PI, closing=smooth((p-4.21)/.87);
    const depth=1800+Math.sin(phase*.5)*180, k=depth/1800;
    // Keep the original depth, drift and trail rendering; only relocate its path.
    target.set(target.x*halfW*k+Math.sin(time*1.25)*10*(1-closing),
      target.y*halfH*k+Math.cos(time*1.05)*7*(1-closing),-depth);
    target.applyQuaternion(camera.quaternion).add(camera.position);
    const jump=Math.abs(delta)>.22;
    if(!initialized || reverse || jump || previousAspect!==camera.aspect || !active || (dt===0 && Math.abs(delta)>.00006)) {
      clear(); tip.copy(target); initialized=true;
    }
    previousTip.copy(tip);
    if(dt>0) tip.lerp(target,1-Math.exp(-dt*20));
    head.position.copy(tip); halo.position.copy(tip); halo.quaternion.copy(camera.quaternion);
    const pulse=.92+Math.sin(time*2.1)*.08;
    headMaterial.opacity=active*pulse; haloMaterial.uniforms.opacity.value=active*.48*pulse;
    group.visible=active>.001;
    if(dt>0 && active>0) {
      clock+=dt;
      let changed=false;
      if(direction!==0 && (!samples.length || tip.distanceToSquared(samples.at(-1).point)>1.5)) {
        samples.push({point:tip.clone(),born:clock}); changed=true;
      }
      while(samples.length && (clock-samples[0].born>1.35 || samples.length>(direction<0?62:92))) {samples.shift();changed=true;}
      // Fade with the newest sample's age as well as narrowing the tail.
      const recent=samples.length?clock-samples.at(-1).born:2;
      material.uniforms.opacity.value=active*(1-smooth((recent-.12)/1.16));
      if(changed) rebuild();
      spawn+=dt*(direction===0?12:38);
      while(spawn>=1) {
        spawn--; const s=sparks[nextSpark]; nextSpark=(nextSpark+1)%sparks.length; serial++;
        const a=random(serial+7)*Math.PI*2,r=(40+Math.sqrt(random(serial+11))*120)*(mobile?.65:1);
        s.mesh.position.copy(tip).add(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r*.8,(random(serial+19)-.5)*100));
        s.velocity.copy(tip).sub(previousTip).multiplyScalar(-.12/Math.max(dt,.001));
        s.velocity.x+=(random(serial+23)-.5)*38; s.velocity.y+=(random(serial+29)-.5)*35;
        s.life=s.total=.45+random(serial+31)*.65; s.phase=random(serial+41)*Math.PI*2;
        s.size=3.5+random(serial+37)*4.5; s.mesh.visible=true;
      }
      for(const s of sparks) {
        s.life-=dt; s.mesh.visible=s.life>0;
        if(s.life<=0) continue;
        s.velocity.multiplyScalar(Math.pow(.94,dt*60)); s.mesh.position.addScaledVector(s.velocity,dt);
        const age=1-s.life/s.total;
        const twinkle=.55+.45*Math.pow(Math.sin(age*9+s.phase),2);
        s.mesh.quaternion.copy(camera.quaternion);
        s.mesh.scale.setScalar(s.size*(.78+twinkle*.22));
        s.mesh.material.uniforms.opacity.value=active*smooth(age/.12)*(1-smooth((age-.28)/.72))*twinkle;
      }
    }
    if(direction!==0) previousDirection=direction;
    previousProgress=p;
    previousAspect=camera.aspect;
  }
  return {update};
}

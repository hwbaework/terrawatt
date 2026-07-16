import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* 3단계 3D 건물 뷰어 — 밝은 낮 + 바닥만 (다른 효과 없음). 마우스로 회전. */
export function BuildingViewer({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let w = el.clientWidth || 800;
    let h = el.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfeaf4); // 밝은 낮 하늘
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // 밝은 낮 조명 (하늘반사 + 태양)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcbd3da, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.0);
    sun.position.set(60, 120, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;

    let raf = 0;
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        model.position.sub(center); // 중심 원점 → 바닥은 y = -size.y/2
        model.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        scene.add(model);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const groundY = -size.y / 2;

        // 바닥 (밝은 회색 평면, 그림자 받음) — 다른 효과 없음
        const ground = new THREE.Mesh(
          new THREE.CircleGeometry(maxDim * 3.5, 56),
          new THREE.MeshStandardMaterial({ color: 0xc9ced4, roughness: 1 }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = groundY;
        ground.receiveShadow = true;
        scene.add(ground);

        // 카메라 배치
        const dist = maxDim * 1.6;
        camera.position.set(dist * 0.85, dist * 0.6, dist * 0.85);
        camera.near = maxDim / 100;
        camera.far = maxDim * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      (err) => console.warn('[BuildingViewer] glb load fail', err),
    );

    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      if (!ref.current) return;
      w = ref.current.clientWidth;
      h = ref.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, [url]);

  return <div ref={ref} className="absolute inset-0" />;
}

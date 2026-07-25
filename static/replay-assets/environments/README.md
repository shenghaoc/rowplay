# Replay environment assets

The replay remains a generic illustrative venue. These files provide local
surface response only; they do not represent a recorded route, venue, weather,
or time of day.

## Snow 02

- Source: [Poly Haven — Snow 02](https://polyhaven.com/a/snow_02)
- Creator: Rob Tuytel
- License: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- Source resolution used: Poly Haven's 1K JPEG maps
- Retrieved: 2026-07-25

The shipped 512 px JPEGs are resized and recompressed derivatives:

| File                             | Purpose                          | SHA-256                                                            |
| -------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `snow-02/snow-diffuse-512.jpg`   | High/Ultra snow colour variation | `0ae627f87a222d82dfe2f311ef1ba427432fdc58268d4cbcfbbff7764f4f6492` |
| `snow-02/snow-roughness-512.jpg` | High/Ultra snow roughness        | `507717de6130d18c2c057ffbc4ae1575a32a5ea26e338deff6827032c4d5399f` |
| `snow-02/snow-normal-gl-512.jpg` | Ultra OpenGL normal detail       | `5bc9092efa6c2d73cd6b0f04c9ed790b4c3beeed4400938911eb405918a5cc0e` |

Original Poly Haven MD5 values recorded by its public asset API:

- diffuse: `fc54766c6b36ff298699115a619d440b`
- roughness: `1dbae0269e53dbf80d4fd1c4335f25a2`
- OpenGL normal: `f16b5701f9ad521cdd6af10c1d6d2b48`

No asset is fetched at runtime. Low and Medium retain procedural surfaces;
High and Ultra load the local optimized derivatives.

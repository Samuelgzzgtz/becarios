# Atribución de `mobilefacenet.tflite`

Modelo tomado de [MCarlomagno/FaceRecognitionAuth](https://github.com/MCarlomagno/FaceRecognitionAuth)
(`assets/mobilefacenet.tflite`), licencia BSD 3-Clause, © 2020 Marcos Carlomagno.

Arquitectura MobileFaceNets ([arXiv:1804.07573](https://arxiv.org/abs/1804.07573)).
Entrada `[1, 112, 112, 3]`, salida: embedding de 192 floats — coincide con lo que
espera `FaceEmbeddingModel.kt` en este proyecto.

La licencia BSD 3-Clause exige conservar el aviso de copyright al redistribuir
el archivo, de ahí este NOTICE.

## `blaze_face_short_range.tflite`

Detector de rostros de [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector),
© Google LLC, licencia Apache 2.0.

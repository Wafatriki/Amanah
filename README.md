# Vehicle Detector and Classifier

## Descripción del Proyecto
Este proyecto académico consiste en la detección y clasificación de vehículos utilizando un modelo de redes neuronales convolucionales (CNN) entrenado con un dataset propio. El objetivo es detectar vehículos en imágenes y clasificarlos en cinco categorías: avión, autobús, coche, motocicleta y camión. Para ello, se han empleado diferentes stacks tecnológicos como Python, Keras y TensorFlow.

![Texto alternativo(https://github.com/luism1988/vehicle_detector_and_classifier/blob/main/streamlit/img/gif3.gif?raw=true)


## Objetivo
- Crear un dataset propio a partir de imágenes de vehículos.
- Entrenar un modelo de clasificación de vehículos utilizando el dataset creado.
- Evaluar el rendimiento del modelo y presentar los resultados.

## Dataset
El dataset utilizado en este proyecto fue creado a partir de imágenes de vehículos. Las imágenes fueron clasificadas manualmente en cinco categorías: avión, autobús, coche, motocicleta y camión. El dataset se dividió en un conjunto de entrenamiento, un conjunto de validación y un conjunto de test para evaluar el rendimiento final del modelo.

## Modelo
El modelo utilizado para la clasificación de vehículos es una red neuronal convolucional (CNN) personalizada. La arquitectura del modelo incluye varias capas convolucionales, capas de normalización por lotes (BatchNormalization), capas de pooling y capas densas. El modelo fue entrenado utilizando el dataset creado y se evaluó su rendimiento en el conjunto de validación.

### Configuraciones de Hiperparámetros

#### Configuración 1: Cambiar el Número de Filtros en las Capas Convolucionales
- **Accuracy Inicial**: 0.4650
- **Accuracy Final**: 0.9322
- **Val Accuracy Inicial**: 0.1861
- **Val Accuracy Final**: 0.9048
- **Val Loss Inicial**: 7.0554
- **Val Loss Final**: 0.4290

#### Configuración 2: Cambiar el Tamaño del Kernel en las Capas Convolucionales
- **Accuracy Inicial**: 0.4338
- **Accuracy Final**: 0.8549
- **Val Accuracy Inicial**: 0.4199
- **Val Accuracy Final**: 0.8831
- **Val Loss Inicial**: 2.0528
- **Val Loss Final**: 0.2745

#### Configuración 3: Cambiar el Tamaño del Lote y el Número de Épocas
- **Accuracy Inicial**: 0.6938
- **Accuracy Final**: 0.9473
- **Val Accuracy Inicial**: 0.2468
- **Val Accuracy Final**: 0.9048
- **Val Loss Inicial**: 31.0897
- **Val Loss Final**: 0.3652

### Conclusión
Todas las configuraciones muestran mejoras significativas en la precisión y la pérdida de validación. Sin embargo, la **Configuración 3** parece ser la mejor opción en términos de precisión y pérdida de validación.

## Evaluación del Modelo
El modelo fue evaluado utilizando un conjunto de datos de prueba. Se calcularon las métricas de precisión, recall y F1-score para cada una de las cinco categorías de vehículos. Además, se generó una matriz de confusión para visualizar el rendimiento del modelo en cada clase.

## Informe de Clasificación

|               | precision | recall | f1-score | support |
|---------------|------------|--------|----------|---------|
| 0             | 0.9524     | 0.9756 | 0.9639   | 41      |
| 1             | 0.8525     | 0.9811 | 0.9123   | 53      |
| 2             | 0.8500     | 0.8500 | 0.8500   | 60      |
| 3             | 0.8182     | 0.8182 | 0.8182   | 11      |
| 4             | 0.9298     | 0.8030 | 0.8618   | 66      |
| **accuracy**  |            |        | 0.8874   | 231     |
| **macro avg** | 0.8806     | 0.8856 | 0.8812   | 231     |
| **weighted avg** | 0.8900  | 0.8874 | 0.8864   | 231     |

El modelo alcanzó una precisión global del 88.74% en el conjunto de prueba. Las métricas de precisión, recall y F1-score para cada categoría de vehículo muestran que el modelo es efectivo en la clasificación de vehículos. La matriz de confusión proporciona una visualización clara del rendimiento del modelo en cada clase.

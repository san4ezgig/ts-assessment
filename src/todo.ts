import { Annotation, Entity, EntityClass, EntityType, Input } from './types/input';
import { ConvertedAnnotation, ConvertedEntity, Output } from './types/output';
import { isEmpty } from 'lodash';
import * as Yup from 'yup';

// TODO: Convert Input to the Output structure. Do this in an efficient and generic way.
// HINT: Make use of the helper library "lodash"
export const convertInput = (input: Input): Output => {
  const documents = input.documents.map((document) => {
    // TODO: map the entities to the new structure and sort them based on the property "name"
    // Make sure the nested children are also mapped and sorted
    const entitiesParentChildHashMap = getEntitiesParentChildHashMap(document.entities);
    const convertedEntitiesHashMap = {};
    const entities = convertEntities(document.entities, entitiesParentChildHashMap, convertedEntitiesHashMap);

    // TODO: map the annotations to the new structure and sort them based on the property "index"
    // Make sure the nested children are also mapped and sorted
    const annotationsParentChildHashMap = getAnnotationsParentChildHashMap(document.annotations);
    const annotations = document.annotations
      .filter(filterChildAnnotations)
      .map((annotation) => convertAnnotation(annotation, convertedEntitiesHashMap, annotationsParentChildHashMap))
      .sort(sortAnnotations);

    return { id: document.id, entities, annotations };
  });

  return { documents };
};

const convertEntities = (
  entities: Entity[],
  parentChildHashMap: Record<string, Array<Entity>>,
  convertedEntitiesHashMap: Record<string, ConvertedEntity>,
) => {
  return entities
    .map((entity) => convertEntity(entity, parentChildHashMap, convertedEntitiesHashMap))
    .sort(sortEntities);
};

const getEntitiesParentChildHashMap = (entities: Entity[]): Record<string, Array<Entity>> => {
  return entities.reduce(
    (acc, entity) => {
      if (!isEmpty(entity.refs)) {
        entity.refs.forEach((entityId) => {
          if (acc[entityId]) {
            acc[entityId].push(entity);
          } else {
            acc[entityId] = [entity];
          }
        });

        return acc;
      }

      return acc;
    },
    {} as Record<string, Array<Entity>>,
  );
};

// HINT: you probably need to pass extra argument(s) to this function to make it performant.
const convertEntity = (
  entity: Entity,
  parentChildHashMap: Record<string, Array<Entity>>,
  convertedEntitiesHashMap: Record<string, ConvertedEntity>,
): ConvertedEntity => {
  const { id, name, type, class: entityClass } = entity;

  if (convertedEntitiesHashMap[id]) {
    return convertedEntitiesHashMap[id];
  }

  let children: ConvertedEntity[] = [];

  if (parentChildHashMap[id]) {
    children = convertEntities(parentChildHashMap[id], parentChildHashMap, convertedEntitiesHashMap);
  }

  const convertedEntity = {
    id,
    name,
    type,
    class: entityClass,
    children,
  };
  convertedEntitiesHashMap[id] = convertedEntity;

  return convertedEntity;
};

const getAnnotationsParentChildHashMap = (annotations: Annotation[]): Record<string, Array<Annotation>> => {
  return annotations.reduce(
    (acc, annotation) => {
      if (!isEmpty(annotation.refs)) {
        annotation.refs.forEach((annotationId) => {
          if (acc[annotationId]) {
            acc[annotationId].push(annotation);
          } else {
            acc[annotationId] = [annotation];
          }
        });

        return acc;
      }

      return acc;
    },
    {} as Record<string, Array<Annotation>>,
  );
};

const filterChildAnnotations = (annotation: Annotation) => {
  return isEmpty(annotation.refs);
};

// HINT: you probably need to pass extra argument(s) to this function to make it performant.
const convertAnnotation = (
  annotation: Annotation,
  convertedEntitiesHashMap: Record<string, ConvertedEntity>,
  parentChildHashMap: Record<string, Array<Annotation>>,
): ConvertedAnnotation => {
  const { id, entityId, value, indices } = annotation;

  let children: ConvertedAnnotation[] = [];

  if (parentChildHashMap[id]) {
    children = parentChildHashMap[id]
      .map((annotation) => convertAnnotation(annotation, convertedEntitiesHashMap, parentChildHashMap))
      .sort(sortAnnotations);
  }

  const entity = convertedEntitiesHashMap[entityId];

  return {
    id,
    entity: {
      id: entity.id,
      name: entity.name,
    },
    value,
    index: getIndex(indices, children),
    children,
  };
};

const getIndex = (indices: Annotation['indices'], children: ConvertedAnnotation[]) => {
  if (indices && !isEmpty(indices)) {
    return indices[0].start;
  }
  return children.reduce((acc, { index: childIndex }) => Math.min(acc, childIndex), Infinity);
};

const sortEntities = (entityA: ConvertedEntity, entityB: ConvertedEntity) => {
  return entityA.name.toUpperCase() < entityB.name.toUpperCase() ? -1 : 1;
};

const sortAnnotations = (annotationA: ConvertedAnnotation, annotationB: ConvertedAnnotation) => {
  return annotationA.index - annotationB.index;
};

// BONUS: Create validation function that validates the result of "convertInput". Use yup as library to validate your result.
export const validateOutput = (output: Output) => {
  const entityScheme: Yup.ObjectSchema<ConvertedEntity> = Yup.object().shape({
    id: Yup.string().required(),
    name: Yup.string().required(),
    type: Yup.string<EntityType>().required(),
    class: Yup.string<EntityClass>().required(),
    children: Yup.array()
      .of(Yup.lazy(() => entityScheme))
      .required(),
  });
  const annotationScheme: Yup.ObjectSchema<ConvertedAnnotation> = Yup.object().shape({
    id: Yup.string().required(),
    entity: Yup.object({
      id: Yup.string().required(),
      name: Yup.string().required(),
    }).required(),
    value: Yup.string().required().nullable(),
    index: Yup.number().required(),
    children: Yup.array()
      .of(Yup.lazy(() => annotationScheme))
      .required(),
  });

  Yup.object({
    documents: Yup.array(
      Yup.object({
        id: Yup.string().required(),
        entities: Yup.array(entityScheme),
        annotations: Yup.array(annotationScheme),
      }),
    ),
  }).validateSync(output);
};

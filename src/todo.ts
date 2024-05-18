import { Annotation, Entity, EntityClass, EntityType, Input } from './types/input';
import { ConvertedAnnotation, ConvertedEntity, Output } from './types/output';
import { findIndex, isEmpty } from 'lodash';
import * as Yup from 'yup';

// TODO: Convert Input to the Output structure. Do this in an efficient and generic way.
// HINT: Make use of the helper library "lodash"
export const convertInput = (input: Input): Output => {
  const documents = input.documents.map((document) => {
    // TODO: map the entities to the new structure and sort them based on the property "name"
    // Make sure the nested children are also mapped and sorted
    const entitiesParentChildIndexesHashMap = getEntitiesParentChildIndexesHashMap(document.entities);
    const convertedEntitiesHashMap = {};
    const entities = document.entities
      .map((entity, _, entities) =>
        convertEntity(entity, entities, entitiesParentChildIndexesHashMap, convertedEntitiesHashMap),
      )
      .sort(sortEntities);

    // TODO: map the annotations to the new structure and sort them based on the property "index"
    // Make sure the nested children are also mapped and sorted
    const annotationsParentChildIndexesHashMap = getAnnotationsParentChildIndexesHashMap(document.annotations);
    const annotations = document.annotations
      .map((annotation, _, annotations) =>
        convertAnnotation(annotation, annotations, convertedEntitiesHashMap, annotationsParentChildIndexesHashMap, {}),
      )
      .filter(({ isParent }) => isParent)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ isParent, ...rest }) => rest)
      .sort(sortAnnotations);
    return { id: document.id, entities, annotations };
  });

  return { documents };
};

const getEntitiesParentChildIndexesHashMap = (entities: Entity[]): Record<string, Array<number>> => {
  return entities.reduce(
    (acc, entity) => {
      if (!isEmpty(entity.refs)) {
        const indexOfChild = findIndex(entities, { id: entity.id });
        entity.refs.forEach((entityId) => {
          if (acc[entityId]) {
            acc[entityId].push(indexOfChild);
          } else {
            acc[entityId] = [indexOfChild];
          }
        });

        return acc;
      }

      return acc;
    },
    {} as Record<string, Array<number>>,
  );
};

// HINT: you probably need to pass extra argument(s) to this function to make it performant.
const convertEntity = (
  entity: Entity,
  entities: Entity[],
  parentChildIndexesHashMap: Record<string, Array<number>>,
  convertedEntitiesHashMap: Record<string, ConvertedEntity>,
): ConvertedEntity => {
  const { id, name, type, class: entityClass } = entity;

  if (convertedEntitiesHashMap[id]) {
    return convertedEntitiesHashMap[id];
  }

  let children: ConvertedEntity[] = [];

  if (parentChildIndexesHashMap[id]) {
    children = parentChildIndexesHashMap[id]
      .map((indexOfEntity) =>
        convertEntity(entities[indexOfEntity], entities, parentChildIndexesHashMap, convertedEntitiesHashMap),
      )
      .sort(sortEntities);
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

const getAnnotationsParentChildIndexesHashMap = (annotations: Annotation[]): Record<string, Array<number>> => {
  return annotations.reduce(
    (acc, annotation) => {
      if (!isEmpty(annotation.refs)) {
        const indexOfChild = findIndex(annotations, { id: annotation.id });
        annotation.refs.forEach((annotationId) => {
          if (acc[annotationId]) {
            acc[annotationId].push(indexOfChild);
          } else {
            acc[annotationId] = [indexOfChild];
          }
        });

        return acc;
      }

      return acc;
    },
    {} as Record<string, Array<number>>,
  );
};

// HINT: you probably need to pass extra argument(s) to this function to make it performant.
const convertAnnotation = (
  annotation: Annotation,
  annotations: Annotation[],
  convertedEntitiesHashMap: Record<string, ConvertedEntity>,
  parentChildIndexesHashMap: Record<string, Array<number>>,
  convertedAnnotationsHashMap: Record<string, ConvertedAnnotation>,
): ConvertedAnnotation => {
  const { id, entityId, refs, value, indices } = annotation;
  const isParent = isEmpty(refs);
  let index;
  if (convertedAnnotationsHashMap.hasOwnProperty(id)) {
    return convertedAnnotationsHashMap[id];
  }

  let children: ConvertedAnnotation[] = [];

  if (parentChildIndexesHashMap[id]) {
    children = parentChildIndexesHashMap[id]
      .map((indexOfAnnotation) =>
        convertAnnotation(
          annotations[indexOfAnnotation],
          annotations,
          convertedEntitiesHashMap,
          parentChildIndexesHashMap,
          convertedAnnotationsHashMap,
        ),
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ isParent, ...rest }) => rest)
      .sort(sortAnnotations);
  }

  if (indices && !isEmpty(indices)) {
    index = indices[0].start;
  } else {
    index = children.reduce((acc, { index: childIndex }) => Math.min(acc, childIndex), Infinity);
  }

  const entity = convertedEntitiesHashMap[entityId];
  const convertedAnnotation = {
    id,
    entity: {
      id: entity.id,
      name: entity.name,
    },
    value,
    index,
    children,
    isParent: isParent,
  };
  convertedAnnotationsHashMap[id] = convertedAnnotation;

  return convertedAnnotation;
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
    value: Yup.string().required(),
    index: Yup.number().required(),
    children: Yup.array()
      .of(Yup.lazy(() => annotationScheme))
      .required(),
    isParent: Yup.boolean(),
  });

  Yup.object({
    documents: Yup.array(
      Yup.object({
        id: Yup.string().required(),
        entities: Yup.array(entityScheme),
        annotations: Yup.array(Yup.object({})),
      }),
    ),
  }).validateSync(output);
};

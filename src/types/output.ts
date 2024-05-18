import { EntityClass, EntityType } from './input';

export interface Output {
  documents: Array<ConvertedDocument>;
}

interface ConvertedDocument {
  id: string;
  entities: ConvertedEntity[];
  annotations: ConvertedAnnotation[];
}

export interface ConvertedEntity {
  id: string;
  name: string;
  type: EntityType;
  class: EntityClass;
  children: ConvertedEntity[]; // pay attention to this property
}

export interface ConvertedAnnotation {
  id: string;
  entity: { id: string; name: string }; // lightweight version of the entity
  value: string | number | null; // the value of the annotation
  index: number; // the startIndex of the first index of the list of indices. Namely indices[0].startIndex, if it exists. In case it's a group (indices = []), take the earliest index of the children.
  children: ConvertedAnnotation[]; // pay attention to this property
}
